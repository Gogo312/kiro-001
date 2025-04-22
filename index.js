const express = require('express');
const qrcode = require('qrcode-terminal');
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const app = express();
const port = process.env.PORT || 3000;

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    let qrGenerated = false;

    const sock = makeWASocket({
        auth: state,
        logger: { level: 'silent' }
    });

    // QR Code Generation
    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;
        
        if (qr && !qrGenerated) {
            qrGenerated = true;
            qrcode.generate(qr, { small: true });
            app.get('/', (req, res) => {
                res.send(`
                    <html>
                        <body style="text-align: center;">
                            <h1>Scan QR Code to Activate Bot</h1>
                            <pre>${qr}</pre>
                            <p>Open WhatsApp → Linked Devices → Scan QR</p>
                        </body>
                    </html>
                `);
            });
        }

        if (connection === 'open') {
            console.log('✅ Bot Activated!');
            app.get('/', (req, res) => {
                res.send('🟢 Bot is Online!');
            });
        }
    });

    // Message Handling
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const text = msg.message.conversation || '';
        const sender = msg.key.remoteJid;

        // Commands
        if (text === '.ping') {
            await sock.sendMessage(sender, { text: '🏓 Pong!' });
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startSock();
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
