require('dotenv').config();
const tmi = require('tmi.js');
const express = require('express');
const JsonFile = require('./utils/json-file');

const app = express();
app.use(express.static('public'));

const channels = {};
const connection = {};

const client = new tmi.client({
    identity: {
        username: process.env.BOT_USERNAME,
        password: process.env.OAUTH_TOKEN
    },
    channels: []
});


const actions = {
    stop: async ({ channel }) => connection[channel].emit('youtube-player-stop-hide'),
    next: async ({ channel }) => playFromQueue({ channel }),
    add: async ({ channel, context, videoId }) => {
        addToQueue({ channel }, {
            userId: context['user-id'],
            videoId: videoId
        });
        const { is_playing } = await isPlayerPlaying({ channel });
        if (is_playing === false) {
            playFromQueue({ channel });
        }
    }
};

app.get('/', (req, res) => {
    res.status(200).send('Hello, World!');
});

if (module === require.main) {

    const server = require('http').createServer(app);
    const io = require('socket.io')(server);

    io.on('connection', async (socket) => {

        const target = socket.handshake.headers.referer.split('?')[1];
        if (target) {
            const channel = target.split('=')[1];
            channels[channel] = new JsonFile(`./data/${channel}-playlist.json`, []);
            connection[channel] = socket;

            console.log({ message: 'yt connected', channel });

            connection[channel].on('youtube-player-ready', onReadyYouTubePlayer);
            connection[channel].on('youtube-player-ended', onEndedYouTubePlayer);

            connection[channel].emit('youtube-player-ready', { channel });

            connection[channel].on('disconnect', async (reason) => {
                console.log({ message: 'yt disconnect', channel }, reason);
                await removeListeners(channel);
            });
            connection[channel].on('error', async (error) => {
                console.log({ message: 'yt error', channel }, error);
                await removeListeners(channel);
            });
        }
    });


    client.on('message', onMessageHandler);
    client.on('connected', onConnectedHandler);

    client.connect()
        .then(connected => {
            console.log({ message: 'irc connected' }, connected);
            server.listen(process.env.PORT || 9000, async () => {
                const port = server.address().port;
                console.log({ message: `App listening on port ${port}` });
            });
        });
}

async function onMessageHandler(channel, context, msg, self) {
    channel = channel.replace('#', '');

    if (self) return;
    if (!connection[channel]) return;

    const parts = msg.split(' ');
    const commandName = parts[0];

    try {
        if (commandName === '!yt') {

            const index = parts[1].indexOf('=') + 1;
            const param = parts[1].slice(index);

            if (param === 'stop') {
                await actions['stop']({channel});
            } else if (param === 'next') {
                await actions['next']({channel});
            } else {
                await actions['add']({ channel, context, videoId: param });
            }

        } else {
            console.log({ message: `*${channel} Unknown ${msg}` });
        }
    } catch (error) {
        console.error(error);
    }
}

async function onReadyYouTubePlayer({ channel }) {
    console.log({ message: 'youtube-player-ready', channel });

    try {
        if(channel) {
            const joined = await client.join(channel);
            console.log({ message: 'IRC joined', channel, joined });
        }
    } catch (error) {
        console.log(error);
    }
}

function onEndedYouTubePlayer({ channel }) {
    console.log({ message: 'youtube-player-ended', channel });
    playFromQueue(channels[channel]);
}

async function removeListeners(channel) {
    connection[channel].removeListener('youtube-player-ready', onReadyYouTubePlayer);
    connection[channel].removeListener('youtube-player-ended', onEndedYouTubePlayer);
    console.log({ message: 'yt removeListeners', channel });

    if (client.readyState() === 'OPEN') {
        const parted = await client.part(channel);
        console.log({ message: 'IRC parted', channel, parted });
    }
}

async function isPlayerPlaying({ channel }) {
    return new Promise(async (resolve, reject) => {
        connection[channel].once('youtube-player-is-player-playing', (data) => {
            resolve(data);
        });
        connection[channel].emit('youtube-player-is-player-playing');
        await wait_ms(500);
        reject({ message: 'Timeout YT Player not responding' });
    });
}

async function wait_ms(milliseconds) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
}

function playFromQueue({ channel }) {
    const playlist = channels[channel];
    if (playlist.getValues().length > 0) {
        const items = playlist.getValues();
        console.log({ message: `Now playing queued videoId ${items[0].videoId}`, channel });
        sendVideoParamsToPlayer({ channel }, items.shift());
        playlist.setValues(items);
    }
}

function addToQueue({ channel }, { userId, videoId }) {
    const playlist = channels[channel];
    playlist.data.push({
        userId: userId,
        videoId: videoId
    });
    playlist.setValues(playlist.data);
    console.log({ message: `Added ${videoId}`, channel });
}

function sendVideoParamsToPlayer({ channel }, { videoId }) {
    const parameters = {
        videoId: videoId
    };
    const quality = 'small';
    const volume = 10;
    const watch = true;

    connection[channel].emit('youtube-player-play', { parameters, quality, volume, watch });
}

async function onConnectedHandler(addr, port) {
    console.log({ message: `* Connected to ${addr}:${port}` });
}

module.exports = app;