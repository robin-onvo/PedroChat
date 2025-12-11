#include <stdio.h>
#include <unistd.h>
#include <termios.h>
#include <fcntl.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <stdbool.h>

#include "libs/jansson/jansson.h"
#include "libs/MultiplayerApi.h"

static void on_multiplayer_event(
    const char *event,
    int64_t messageId,
    const char *clientId,
    json_t *data,
    void *context)
{
	
	char* strData = NULL;
	
	if(data)
		strData = json_dumps(data, JSON_INDENT(2));

	printf("Multiplayer event: %s (msgId: %lld, clientId: %s)\n", event, (long long)messageId, clientId ? clientId : "null");
	if (strData)
	{
		printf("Data: %s\n", strData);
	}

    /* event: "joined", "leaved" (om servern skickar det), eller "game" */
    if (strcmp(event, "joined") == 0) {

	} else if (strcmp(event, "leaved") == 0) {

    } else if (strcmp(event, "game") == 0) {
        
    }

	free(strData);

    /* data är ett json_t* (object); anropa json_incref(data) om du vill spara det efter callbacken */
}

int main_host(MultiplayerApi* api)
{
	json_t *data = json_object();
	json_object_set_new(data, "name", json_string("My session"));
	json_object_set_new(data, "private", json_boolean(false));

	char *session = NULL;
	char *clientId = NULL;
	json_t *hostData = NULL;

	int rc = mp_api_host(api, data, &session, &clientId, &hostData);
	if (rc != MP_API_OK) {
		printf("Kunde inte skapa session: %d\n", rc);
		return -1;
	}

	json_decref(data);

	printf("Du hostar session: %s (clientId: %s)\n", session, clientId);

	/* hostData kan innehålla extra data från servern (oftast tomt objekt) */
	if (hostData) json_decref(hostData);
	free(session);
	free(clientId);

	return 0;
}

int main_join(MultiplayerApi* api, const char* sessionId)
{
	char *joinedSession = NULL;
	char *joinedClientId = NULL;
	json_t *joinPayload = json_object();          /* t.ex. namn, färg osv. */
	json_object_set_new(joinPayload, "name", json_string("Spelare 1"));

	json_t *joinData = NULL;
	int rc = mp_api_join(api, sessionId, joinPayload, &joinedSession, &joinedClientId, &joinData);

	json_decref(joinPayload);  /* vår lokala payload */

	if (rc == MP_API_OK) {
		printf("Ansluten till session: %s (clientId: %s)\n", joinedSession, joinedClientId);
		/* joinData kan innehålla status eller annan info */
		if (joinData) json_decref(joinData);
		free(joinedSession);
		free(joinedClientId);
	} else if (rc == MP_API_ERR_REJECTED) {
		/* t.ex. ogiltigt sessions‑ID, läs ev. joinData för mer info om du valde att ta emot det */
	} else {
		/* nätverksfel/protokollfel etc. */
	}

	return 0;
}

int main_list(MultiplayerApi* api)
{
	printf("Hämtar lista över publika sessioner...\n");

	json_t *sessionList = NULL;
	int rc = mp_api_list(api, &sessionList);
	if (rc != MP_API_OK) {
		printf("Kunde inte hämta session-lista: %d\n", rc);
		return -1;
	}

	const char* firstSessionId = NULL;

	if (json_array_size(sessionList) == 0) {
		printf("Inga publika sessioner tillgängliga.\n");

	} else{
		printf("Totalt %zu sessioner.\n", json_array_size(sessionList));

		size_t index;
		json_t *value;
		printf("Tillgängliga publika sessioner:\n");
		json_array_foreach(sessionList, index, value) {
			json_t *sess_val = json_object_get(value, "id");
			if (json_is_string(sess_val)) {
				if(firstSessionId == NULL)
					firstSessionId = json_string_value(sess_val);

				const char *sessionId = json_string_value(sess_val);
				printf(" - %s\n", sessionId);
			}
		}

		printf("\n");
	}

	if(firstSessionId)
		main_join(api, "HU2J7D");
	else
		main_host(api);


	json_decref(sessionList);
	return 0;
}

int main()
{

	MultiplayerApi* api = mp_api_create("172.19.4.22", 9001, "c2438167-831b-4bf7-8bdc-0489eaf98e25");
	if (!api)
	{
		printf("Failed to create MultiplayerApi instance\n");
		return -1;
	}

	//main_host(api);
	main_list(api);
	//main_join(api, "HU2J7D");


	int listener_id = mp_api_listen(api, on_multiplayer_event, NULL);

	json_t* data = json_object();
	json_object_set_new(data, "score", json_integer(100));

	while (1)
	{
		int rc = mp_api_game(api, data, NULL);
		printf("Skickade game-data, rc=%d\n", rc);

		sleep(1);
	}

	json_decref(data);

	mp_api_unlisten(api, listener_id);
	mp_api_destroy(api);

	return 0;
}

