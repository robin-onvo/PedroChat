#include "MultiplayerApi.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>

#include <unistd.h>
#include <pthread.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <arpa/inet.h>

typedef struct ListenerNode {
    int id;
    MultiplayerListener cb;
    void *context;
    struct ListenerNode *next;
} ListenerNode;

typedef struct ListenerSnapshot {
    MultiplayerListener cb;
    void *context;
} ListenerSnapshot;

struct MultiplayerApi {
    char *server_host;
    uint16_t server_port;
	char identifier[37];
    int sockfd;
    char *session_id;

    pthread_t recv_thread;
    int recv_thread_started;
    int running;

    pthread_mutex_t lock;
    ListenerNode *listeners;
    int next_listener_id;
};

static int connect_to_server(const char *host, uint16_t port);
static int ensure_connected(MultiplayerApi *api);
static int send_all(int fd, const char *buf, size_t len);
static int send_json_line(MultiplayerApi *api, json_t *obj); /* tar över ägarskap */
static int read_line(int fd, char **out_line);
static void *recv_thread_main(void *arg);
static void process_line(MultiplayerApi *api, const char *line);
static int start_recv_thread(MultiplayerApi *api);

MultiplayerApi *mp_api_create(const char *server_host, uint16_t server_port, const char *identifier)
{
    int len = strlen(identifier);
	if (len != 36) {
		return NULL;
	}
	
	MultiplayerApi *api = (MultiplayerApi *)calloc(1, sizeof(MultiplayerApi));
    if (!api) {
        return NULL;
    }


    if (server_host) {
        api->server_host = strdup(server_host);
    } else {
        api->server_host = strdup("127.0.0.1");
    }

    if (!api->server_host) {
        free(api);
        return NULL;
    }

    api->server_port = server_port;
	
	strncpy(api->identifier, identifier, 37);

    api->sockfd = -1;
    api->session_id = NULL;
    api->recv_thread_started = 0;
    api->running = 0;
    api->listeners = NULL;
    api->next_listener_id = 1;

    if (pthread_mutex_init(&api->lock, NULL) != 0) {
        free(api->server_host);
        free(api);
        return NULL;
    }

    return api;
}

void mp_api_destroy(MultiplayerApi *api) {
    if (!api) return;

    if (api->recv_thread_started && api->sockfd >= 0) {
        shutdown(api->sockfd, SHUT_RDWR);
        pthread_join(api->recv_thread, NULL);
    }

    if (api->sockfd >= 0) {
        close(api->sockfd);
    }

    pthread_mutex_lock(&api->lock);
    ListenerNode *node = api->listeners;
    api->listeners = NULL;
    pthread_mutex_unlock(&api->lock);

    while (node) {
        ListenerNode *next = node->next;
        free(node);
        node = next;
    }

    if (api->session_id) {
        free(api->session_id);
    }
    if (api->server_host) {
        free(api->server_host);
    }

    pthread_mutex_destroy(&api->lock);
    free(api);
}

int mp_api_host(MultiplayerApi *api,
				json_t *data,
                char **out_session,
                char **out_clientId,
                json_t **out_data) {
    if (!api) return MP_API_ERR_ARGUMENT;
    if (api->session_id) return MP_API_ERR_STATE;

    int rc = ensure_connected(api);
    if (rc != MP_API_OK) return rc;

    json_t *root = json_object();
    if (!root) return MP_API_ERR_IO;

    json_object_set_new(root, "identifier", json_string(api->identifier));
    json_object_set_new(root, "cmd", json_string("host"));
    
	json_t *data_copy;
    if (data && json_is_object(data)) {
        data_copy = json_deep_copy(data);
    } else {
        data_copy = json_object();
    }
    json_object_set_new(root, "data", data_copy);

    rc = send_json_line(api, root);
    if (rc != MP_API_OK) {
        return rc;
    }

    char *line = NULL;
    rc = read_line(api->sockfd, &line);
    if (rc != MP_API_OK) {
        return rc;
    }

    json_error_t jerr;
    json_t *resp = json_loads(line, 0, &jerr);
    free(line);
    if (!resp || !json_is_object(resp)) {
        if (resp) json_decref(resp);
        return MP_API_ERR_PROTOCOL;
    }

    json_t *cmd_val = json_object_get(resp, "cmd");
    if (!json_is_string(cmd_val) || strcmp(json_string_value(cmd_val), "host") != 0) {
        json_decref(resp);
        return MP_API_ERR_PROTOCOL;
    }

    json_t *sess_val = json_object_get(resp, "session");
    if (!json_is_string(sess_val)) {
        json_decref(resp);
        return MP_API_ERR_PROTOCOL;
    }
    const char *session = json_string_value(sess_val);

    json_t *cid_val = json_object_get(resp, "clientId");
    const char *clientId = json_is_string(cid_val) ? json_string_value(cid_val) : NULL;

    json_t *data_val = json_object_get(resp, "data");
    json_t *data_obj = NULL;
    if (json_is_object(data_val)) {
        data_obj = data_val;
        json_incref(data_obj);
    }

    api->session_id = strdup(session);
    if (!api->session_id) {
        if (data_obj) json_decref(data_obj);
        json_decref(resp);
        return MP_API_ERR_IO;
    }

    if (out_session) {
        *out_session = strdup(session);
    }
    if (out_clientId && clientId) {
        *out_clientId = strdup(clientId);
    }
    if (out_data) {
        *out_data = data_obj;
    } else if (data_obj) {
        json_decref(data_obj);
    }

    json_decref(resp);

    rc = start_recv_thread(api);
    if (rc != MP_API_OK) {
        return rc;
    }

    return MP_API_OK;
}

int mp_api_list(MultiplayerApi *api, json_t **out_list)
{
	if (!api || !out_list) return MP_API_ERR_ARGUMENT;

	int rc = ensure_connected(api);
	if (rc != MP_API_OK) return rc;

	json_t *root = json_object();
	if (!root) return MP_API_ERR_IO;

    json_object_set_new(root, "identifier", json_string(api->identifier));
	json_object_set_new(root, "cmd", json_string("list"));

	rc = send_json_line(api, root);
	if (rc != MP_API_OK) {
		return rc;
	}

	char *line = NULL;
	rc = read_line(api->sockfd, &line);
	if (rc != MP_API_OK) {
		return rc;
	}

	printf("Received line: %s\n", line); // Debug print

	json_error_t jerr;
	json_t *resp = json_loads(line, 0, &jerr);
	free(line);
	if (!resp || !json_is_object(resp)) {
		if (resp) json_decref(resp);
		return MP_API_ERR_PROTOCOL;
	}

	json_t *cmd_val = json_object_get(resp, "cmd");
	if (!json_is_string(cmd_val) || strcmp(json_string_value(cmd_val), "list") != 0) {
		json_decref(resp);
		return MP_API_ERR_PROTOCOL;
	}

	json_t *list_val = json_object_get(resp, "data");
	if (!json_is_object(list_val)) {
		json_decref(resp);
		return MP_API_ERR_PROTOCOL;
	}

	json_t *list_obj = json_object_get(list_val, "list");
	if (!json_is_array(list_obj)) {
		json_decref(resp);
		return MP_API_ERR_PROTOCOL;
	}

	*out_list = list_obj;
	json_incref(*out_list);

	json_decref(resp);
	return MP_API_OK;
}

int mp_api_join(MultiplayerApi *api,
                const char *sessionId,
                json_t *data,
                char **out_session,
                char **out_clientId,
                json_t **out_data) {
    if (!api || !sessionId) return MP_API_ERR_ARGUMENT;
    if (api->session_id) return MP_API_ERR_STATE;

    int rc = ensure_connected(api);
    if (rc != MP_API_OK) return rc;

    json_t *root = json_object();
    if (!root) return MP_API_ERR_IO;
	
    json_object_set_new(root, "identifier", json_string(api->identifier));
    json_object_set_new(root, "session", json_string(sessionId));
    json_object_set_new(root, "cmd", json_string("join"));

    json_t *data_copy;
    if (data && json_is_object(data)) {
        data_copy = json_deep_copy(data);
    } else {
        data_copy = json_object();
    }
    json_object_set_new(root, "data", data_copy);

    rc = send_json_line(api, root);
    if (rc != MP_API_OK) {
        return rc;
    }

    char *line = NULL;
    rc = read_line(api->sockfd, &line);
    if (rc != MP_API_OK) {
        return rc;
    }

    json_error_t jerr;
    json_t *resp = json_loads(line, 0, &jerr);
    free(line);
    if (!resp || !json_is_object(resp)) {
        if (resp) json_decref(resp);
        return MP_API_ERR_PROTOCOL;
    }

    json_t *cmd_val = json_object_get(resp, "cmd");
    if (!json_is_string(cmd_val) || strcmp(json_string_value(cmd_val), "join") != 0) {
        json_decref(resp);
        return MP_API_ERR_PROTOCOL;
    }

    json_t *sess_val = json_object_get(resp, "session");
    const char *session = NULL;
    if (json_is_string(sess_val)) {
        session = json_string_value(sess_val);
    }

    json_t *cid_val = json_object_get(resp, "clientId");
    const char *clientId = json_is_string(cid_val) ? json_string_value(cid_val) : NULL;

    json_t *data_val = json_object_get(resp, "data");
    json_t *data_obj = NULL;
    if (json_is_object(data_val)) {
        data_obj = data_val;
        json_incref(data_obj);
    }

    int joinAccepted = 1;
    if (data_obj) {
        json_t *status_val = json_object_get(data_obj, "status");
        if (json_is_string(status_val) &&
            strcmp(json_string_value(status_val), "error") == 0) {
            joinAccepted = 0;
        }
    }

    if (joinAccepted && session) {
        api->session_id = strdup(session);
        if (!api->session_id) {
            if (data_obj) json_decref(data_obj);
            json_decref(resp);
            return MP_API_ERR_IO;
        }
    }

    if (out_session && session) {
        *out_session = strdup(session);
    }
    if (out_clientId && clientId) {
        *out_clientId = strdup(clientId);
    }
    if (out_data) {
        *out_data = data_obj;
    } else if (data_obj) {
        json_decref(data_obj);
    }

    json_decref(resp);

    if (joinAccepted && api->session_id) {
        rc = start_recv_thread(api);
        if (rc != MP_API_OK) {
            return rc;
        }
    }

    return joinAccepted ? MP_API_OK : MP_API_ERR_REJECTED;
}

int mp_api_game(MultiplayerApi *api, json_t *data, const char* destination) {
    if (!api || !data) return MP_API_ERR_ARGUMENT;
    if (api->sockfd < 0 || !api->session_id) return MP_API_ERR_STATE;

    json_t *root = json_object();
    if (!root) return MP_API_ERR_IO;

	json_object_set_new(root, "identifier", json_string(api->identifier));
    json_object_set_new(root, "session", json_string(api->session_id));
    json_object_set_new(root, "cmd", json_string("game"));

	if(destination)
		json_object_set_new(root, "destination", json_string(destination));

    json_t *data_copy;
    if (json_is_object(data)) {
        data_copy = json_deep_copy(data);
    } else {
        data_copy = json_object();
    }
    json_object_set_new(root, "data", data_copy);

    return send_json_line(api, root);
}

int mp_api_listen(MultiplayerApi *api,
                  MultiplayerListener cb,
                  void *context) {
    if (!api || !cb) return -1;

    ListenerNode *node = (ListenerNode *)malloc(sizeof(ListenerNode));
    if (!node) return -1;

    node->cb = cb;
    node->context = context;

    pthread_mutex_lock(&api->lock);
    node->id = api->next_listener_id++;
    node->next = api->listeners;
    api->listeners = node;
    pthread_mutex_unlock(&api->lock);

    return node->id;
}

void mp_api_unlisten(MultiplayerApi *api, int listener_id) {
    if (!api || listener_id <= 0) return;

    pthread_mutex_lock(&api->lock);
    ListenerNode *prev = NULL;
    ListenerNode *cur = api->listeners;
    while (cur) {
        if (cur->id == listener_id) {
            if (prev) {
                prev->next = cur->next;
            } else {
                api->listeners = cur->next;
            }
            free(cur);
            break;
        }
        prev = cur;
        cur = cur->next;
    }
    pthread_mutex_unlock(&api->lock);
}

/* --- Interna hjälpfunktioner --- */

static int connect_to_server(const char *host, uint16_t port) {
    if (!host) host = "127.0.0.1";

    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%u", (unsigned int)port);

    struct addrinfo hints;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;      /* IPv4 eller IPv6 */
    hints.ai_socktype = SOCK_STREAM;

    struct addrinfo *res = NULL;
    int err = getaddrinfo(host, port_str, &hints, &res);
    if (err != 0) {
        return -1;
    }

    int fd = -1;
    for (struct addrinfo *rp = res; rp != NULL; rp = rp->ai_next) {
        fd = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (fd == -1) continue;
        if (connect(fd, rp->ai_addr, rp->ai_addrlen) == 0) {
            break;
        }
        close(fd);
        fd = -1;
    }

    freeaddrinfo(res);
    return fd;
}

static int ensure_connected(MultiplayerApi *api) {
    if (!api) return MP_API_ERR_ARGUMENT;
    if (api->sockfd >= 0) return MP_API_OK;

    int fd = connect_to_server(api->server_host, api->server_port);
    if (fd < 0) {
        return MP_API_ERR_CONNECT;
    }
    api->sockfd = fd;
    return MP_API_OK;
}

static int send_all(int fd, const char *buf, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(fd, buf + sent, len - sent, 0);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        if (n == 0) {
            return -1;
        }
        sent += (size_t)n;
    }
    return 0;
}

static int send_json_line(MultiplayerApi *api, json_t *obj) {
    if (!api || api->sockfd < 0 || !obj) return MP_API_ERR_ARGUMENT;

    char *text = json_dumps(obj, JSON_COMPACT);
    if (!text) {
        json_decref(obj);
        return MP_API_ERR_IO;
    }

	printf("Sending JSON: %s\n", text); // Debug print

    size_t len = strlen(text);
    int fd = api->sockfd;

    int rc = 0;
    if (send_all(fd, text, len) != 0 || send_all(fd, "\n", 1) != 0) {
        rc = MP_API_ERR_IO;
    }

    free(text);
    json_decref(obj);

    return rc;
}

static int read_line(int fd, char **out_line) {
    if (!out_line) return MP_API_ERR_ARGUMENT;

    size_t cap = 256;
    size_t len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) return MP_API_ERR_IO;

    for (;;) {
        char c;
        ssize_t n = recv(fd, &c, 1, 0);
        if (n < 0) {
            if (errno == EINTR) continue;
            free(buf);
            return MP_API_ERR_IO;
        }
        if (n == 0) {
            free(buf);
            return MP_API_ERR_IO;
        }

        if (c == '\n') {
            break;
        }

        if (len + 1 >= cap) {
            cap *= 2;
            char *tmp = (char *)realloc(buf, cap);
            if (!tmp) {
                free(buf);
                return MP_API_ERR_IO;
            }
            buf = tmp;
        }

        buf[len++] = c;
    }

    buf[len] = '\0';
    *out_line = buf;
    return MP_API_OK;
}

static void process_line(MultiplayerApi *api, const char *line) {
    if (!api || !line || !*line) return;

    json_error_t jerr;
    json_t *root = json_loads(line, 0, &jerr);
    if (!root || !json_is_object(root)) {
        if (root) json_decref(root);
        return;
    }

    json_t *cmd_val = json_object_get(root, "cmd");
    if (!json_is_string(cmd_val)) {
        json_decref(root);
        return;
    }

    const char *cmd = json_string_value(cmd_val);
    if (!cmd) {
        json_decref(root);
        return;
    }

    if (strcmp(cmd, "joined") != 0 &&
        strcmp(cmd, "leaved") != 0 &&
        strcmp(cmd, "game") != 0) {
        json_decref(root);
        return;
    }

    json_int_t msgId = 0;
    json_t *mid_val = json_object_get(root, "messageId");
    if (json_is_integer(mid_val)) {
        msgId = json_integer_value(mid_val);
    }

    const char *clientId = NULL;
    json_t *cid_val = json_object_get(root, "clientId");
    if (json_is_string(cid_val)) {
        clientId = json_string_value(cid_val);
    }

    json_t *data_val = json_object_get(root, "data");
    json_t *data_obj;
    if (json_is_object(data_val)) {
        data_obj = data_val;
        json_incref(data_obj);
    } else {
        data_obj = json_object();
    }

    pthread_mutex_lock(&api->lock);
    int count = 0;
    ListenerNode *node = api->listeners;
    while (node) {
        if (node->cb) count++;
        node = node->next;
    }

    if (count == 0) {
        pthread_mutex_unlock(&api->lock);
        json_decref(data_obj);
        json_decref(root);
        return;
    }

    ListenerSnapshot *snapshot = (ListenerSnapshot *)malloc(sizeof(ListenerSnapshot) * count);
    if (!snapshot) {
        pthread_mutex_unlock(&api->lock);
        json_decref(data_obj);
        json_decref(root);
        return;
    }

    int idx = 0;
    node = api->listeners;
    while (node) {
        if (node->cb) {
            snapshot[idx].cb = node->cb;
            snapshot[idx].context = node->context;
            idx++;
        }
        node = node->next;
    }
    pthread_mutex_unlock(&api->lock);

    for (int i = 0; i < count; ++i) {
        snapshot[i].cb(cmd, (int64_t)msgId, clientId, data_obj, snapshot[i].context);
    }

    free(snapshot);
    json_decref(data_obj);
    json_decref(root);
}

static void *recv_thread_main(void *arg) {
    MultiplayerApi *api = (MultiplayerApi *)arg;
    char buffer[1024];
    char *acc = NULL;
    size_t acc_len = 0;
    size_t acc_cap = 0;

    while (1) {
        ssize_t n = recv(api->sockfd, buffer, sizeof(buffer), 0);
        if (n <= 0) {
            break;
        }

        for (ssize_t i = 0; i < n; ++i) {
            char ch = buffer[i];
            if (ch == '\n') {
                if (acc_len > 0) {
                    char *line = (char *)malloc(acc_len + 1);
                    if (!line) {
                        acc_len = 0;
                        continue;
                    }
                    memcpy(line, acc, acc_len);
                    line[acc_len] = '\0';

                    acc_len = 0;
                    process_line(api, line);
                    free(line);
                } else {
                    acc_len = 0;
                }
            } else {
                if (acc_len + 1 >= acc_cap) {
                    size_t new_cap = acc_cap == 0 ? 256 : acc_cap * 2;
                    char *tmp = (char *)realloc(acc, new_cap);
                    if (!tmp) {
                        free(acc);
                        acc = NULL;
                        acc_len = 0;
                        acc_cap = 0;
                        break;
                    }
                    acc = tmp;
                    acc_cap = new_cap;
                }
                acc[acc_len++] = ch;
            }
        }
    }

    if (acc) {
        free(acc);
    }

    return NULL;
}

static int start_recv_thread(MultiplayerApi *api) {
    if (!api) return MP_API_ERR_ARGUMENT;
    if (api->recv_thread_started) {
        return MP_API_OK;
    }

    api->running = 1;
    int rc = pthread_create(&api->recv_thread, NULL, recv_thread_main, api);
    if (rc != 0) {
        api->running = 0;
        return MP_API_ERR_IO;
    }

    api->recv_thread_started = 1;
    return MP_API_OK;
}
