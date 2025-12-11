import { MultiplayerApi } from './MultiplayerApi.js';

const api = new MultiplayerApi(`ws${location.protocol === 'https:' ? 's' : ''}://${location.host}/multiplayer`, "c2438167-831b-4bf7-8bdc-0489eaf98e25");


const hostButton = document.getElementById('hostButton');
const joinButton = document.getElementById('joinButton');
const joinSessionInput = document.getElementById('joinSessionInput');
const joinNameInput = document.getElementById('joinNameInput');
const sendButton = document.getElementById('sendButton');
const listButton = document.getElementById('listButton');
const status = document.getElementById('status');

function initiate() {

	hostButton.addEventListener('click', () => {


		api.host({ name: "test", private: false })
			.then((result) => {
				status.textContent = `Hosted session with ID: "${result.session}" with clientId: ${result.clientId}`;
			})
			.catch((error) => {
				console.error('Error hosting session:', error);
			});


	});

	joinButton.addEventListener('click', () => {


		api.join(joinSessionInput.value, { name: joinNameInput.value })
			.then((result) => {
				console.log(result);
				status.textContent = `Joined session: "${result.session}" with clientId: ${result.clientId}`;
			})
			.catch((error) => {
				console.error('Error joining session:', error);
			});




	});

	sendButton.addEventListener('click', () => {


		api.game({ msg: "Hello from client!" });

	});

	listButton.addEventListener('click', () => {
		api.list()
			.then((result) => {
				status.textContent = `Active sessions: ${JSON.stringify(result)}`;
			})
			.catch((error) => {
				console.error('Error listing sessions:', error);
			});
	});


	const unsubscribe = api.listen((event, messageId, clientId, data) => {

		status.textContent = `Received event "${event}" with messageId: "${messageId}" from clientId: "${clientId}" and data: ${JSON.stringify(data)}`;

	});

}

window.addEventListener('load', () => {
	initiate();
});
