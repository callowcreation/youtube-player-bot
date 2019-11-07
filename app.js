require('dotenv').config();
const tmi = require('tmi.js');
const express = require('express');

const app = express();
app.use(express.static('public'));

const playlists = {};
const sockets = {};

const client = new tmi.client({
    identity: {
        username: process.env.BOT_USERNAME,
        password: process.env.OAUTH_TOKEN
    },
    channels: []
});


const actions = {
    stop: async ({ channel }) => sockets[channel].emit('youtube-player-stop-hide'),
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
    res.status(200).send('/yt-player.html?channel=username');
});

if (module === require.main) {

    const server = require('http').createServer(app);
    const io = require('socket.io')(server);

    io.on('connection', async (socket) => {

        const target = socket.handshake.headers.referer.split('?')[1];
        if (target) {
            const channel = target.split('=')[1];
            playlists[channel] = [];
            sockets[channel] = socket;

            console.log({ message: 'yt connected', channel });

            sockets[channel].on('youtube-player-ready', onReadyYouTubePlayer);
            sockets[channel].on('youtube-player-ended', onEndedYouTubePlayer);

            sockets[channel].emit('youtube-player-ready', { channel });

            sockets[channel].on('disconnect', async (reason) => {
                console.log({ message: 'yt disconnect', channel }, reason);
                await removeListeners(channel);
            });
            sockets[channel].on('error', async (error) => {
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
            server.listen(process.env.PORT || 5000, async () => {
                const port = server.address().port;
                console.log({ message: `App listening on port ${port}` });
            });
        });
}

async function onMessageHandler(channel, context, msg, self) {
    channel = channel.replace('#', '');

    if (self) return;
    if (!sockets[channel]) return;

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
    playFromQueue(playlists[channel]);
}

async function removeListeners(channel) {
    sockets[channel].removeListener('youtube-player-ready', onReadyYouTubePlayer);
    sockets[channel].removeListener('youtube-player-ended', onEndedYouTubePlayer);
    console.log({ message: 'yt removeListeners', channel });

    if (client.readyState() === 'OPEN') {
        const parted = await client.part(channel);
        console.log({ message: 'IRC parted', channel, parted });
    }
}

async function isPlayerPlaying({ channel }) {
    return new Promise(async (resolve, reject) => {
        sockets[channel].once('youtube-player-is-player-playing', (data) => {
            resolve(data);
        });
        sockets[channel].emit('youtube-player-is-player-playing');
        await wait_ms(500);
        reject({ message: 'Timeout YT Player not responding' });
    });
}

async function wait_ms(milliseconds) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
}

function playFromQueue({ channel }) {
    const items = playlists[channel];
    if (items.length > 0) {
        console.log({ message: `Now playing queued videoId ${items[0].videoId}`, channel });
        sendVideoParamsToPlayer({ channel }, items.shift());
        playlists[channel] = items;
    }
}

function addToQueue({ channel }, { userId, videoId }) {
    playlists[channel].push({
        userId: userId,
        videoId: videoId
    });
    console.log({ message: `Added ${videoId}`, channel });
}

function sendVideoParamsToPlayer({ channel }, { videoId }) {
    const parameters = {
        videoId: videoId
    };
    const quality = 'small';
    const volume = 10;
    const watch = true;

    sockets[channel].emit('youtube-player-play', { parameters, quality, volume, watch });
}

async function onConnectedHandler(addr, port) {
    console.log({ message: `* Connected to ${addr}:${port}` });
}

module.exports = app;