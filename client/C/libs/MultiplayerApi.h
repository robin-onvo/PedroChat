#ifndef MULTIPLAYER_API_H
#define MULTIPLAYER_API_H

#include <stdint.h>
#include "jansson/jansson.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MultiplayerApi MultiplayerApi;

/* Callback‑typ för inkommande events från servern. */
typedef void (*MultiplayerListener)(
    const char *event,      /* "joined", "leaved", "game" */
    int64_t messageId,      /* sekventiellt meddelande‑ID (från host) */
    const char *clientId,   /* avsändarens klient‑ID (eller NULL) */
    json_t *data,           /* JSON‑objekt med godtycklig speldata */
    void *context         /* godtycklig pekare som skickas vidare */
);

/* Returkoder */
enum {
    MP_API_OK = 0,
    MP_API_ERR_ARGUMENT = 1,
    MP_API_ERR_STATE = 2,
    MP_API_ERR_CONNECT = 3,
    MP_API_ERR_PROTOCOL = 4,
    MP_API_ERR_IO = 5,
    MP_API_ERR_REJECTED = 6  /* t.ex. ogiltigt sessions‑ID vid join */
};

/* Skapar en ny API‑instans. Returnerar NULL vid fel. */
MultiplayerApi *mp_api_create(const char *server_host, uint16_t server_port, const char *identifier);

/* Stänger ner anslutning, stoppar mottagartråd och frigör minne. */
void mp_api_destroy(MultiplayerApi *api);

/* Hostar en ny session. Blockerar tills svar erhållits eller fel uppstår.
   out_session / out_clientId pekar på nyallokerade strängar (malloc) som
   anroparen ansvarar för att free:a. out_data (om ej NULL) får ett json_t*
   med extra data från servern (anroparen ska json_decref när klart). */
int mp_api_host(MultiplayerApi *api,
				json_t *data,
                char **out_session,
                char **out_clientId,
                json_t **out_data);

/*
   Hämtar en lista över tillgängliga publika sessioner.
   Returnerar MP_API_OK vid framgång, annan felkod vid fel.
   Anroparen ansvarar för att json_decref:a out_list när klar. */
int mp_api_list(MultiplayerApi *api,
                  json_t **out_list);

/* Går med i befintlig session.
   sessionId: sessionskod (t.ex. "ABC123").
   data: valfri JSON‑payload med spelarinformation (kan vara NULL).
   out_* fungerar som i mp_api_host.

   Returnerar:
   - MP_API_OK        vid lyckad join
   - MP_API_ERR_REJECTED om servern svarar med status:error (t.ex. ogiltigt ID)
   - annan felkod vid nätverks/protokoll‑fel.
*/
int mp_api_join(MultiplayerApi *api,
                const char *sessionId,
                json_t *data,
                char **out_session,
                char **out_clientId,
                json_t **out_data);

/* Skickar ett "game"‑meddelande med godtycklig JSON‑data till sessionen. */
int mp_api_game(MultiplayerApi *api, json_t *data, const char* destination);

/* Registrerar en lyssnare för inkommande events.
   Returnerar ett positivt listener‑ID, eller −1 vid fel. */
int mp_api_listen(MultiplayerApi *api,
                  MultiplayerListener cb,
                  void *context);

/* Avregistrerar lyssnare. Listener‑ID är värdet från mp_api_listen. */
void mp_api_unlisten(MultiplayerApi *api, int listener_id);

#ifdef __cplusplus
}
#endif

#endif /* MULTIPLAYER_API_H */
