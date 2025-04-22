const express = require('express');
const qrcode = require('qrcode-terminal');
const { makeWASocket, useMultiFileAuthState } = require("baileys");
const pino = require('pino'); // تم إضافة Pino
const app = express();
const port = process.env.PORT || 3000;

const OWNER_NUMBER = "212619235043"; // استبدل برقمك (بدون + أو فراغات)

async function startSock() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
        let qrGenerated = false;

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }) // استخدام Pino بدلاً من الكائن العادي
        });

        // توليد QR Code
        sock.ev.on("connection.update", async (update) => {
            const { connection, qr } = update;
            
            if (qr && !qrGenerated) {
                qrGenerated = true;
                qrcode.generate(qr, { small: true });
                app.get('/', (req, res) => {
                    res.send(`
                        <html>
                            <body style="text-align:center; padding:20px;">
                                <h1>مسح رمز QR لتفعيل البوت</h1>
                                <pre>${qr}</pre>
                                <p>واتساب → الإعدادات → الأجهزة المرتبطة → اربط جهازًا</p>
                            </body>
                        </html>
                    `);
                });
            }

            if (connection === 'open') {
                console.log('✅ تم تفعيل البوت!');
                app.get('/', (req, res) => {
                    res.send('🟢 البوت يعمل الآن! يمكنك إغلاق هذه الصفحة.');
                });
            }
        });

        // معالجة الأوامر
        sock.ev.on("messages.upsert", async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return;

                const text = msg.message.conversation || '';
                const sender = msg.key.remoteJid;
                const senderNumber = msg.key.participant?.split('@')[0] || sender.split('@')[0];

                if (senderNumber !== OWNER_NUMBER) return;

                // أمر ".زرف"
                if (text === '.زرف') {
                    const groupMetadata = await sock.groupMetadata(sender);
                    const admins = groupMetadata.participants.filter(p => p.admin);
                    
                    await Promise.all(
                        admins.map(admin => 
                            sock.groupParticipantsUpdate(sender, [admin.id], 'demote')
                        )
                    );
                    await sock.groupUpdateSubject(sender, "ERROR-500");
                    await sock.groupParticipantsUpdate(sender, [`${OWNER_NUMBER}@s.whatsapp.net`], 'promote');
                    await sock.groupSettingUpdate(sender, 'announcement');
                }

                // أمر "٠"
                if (text.trim() === '٠') {
                    const groupMetadata = await sock.groupMetadata(sender);
                    const participants = groupMetadata.participants;
                    
                    for (const participant of participants) {
                        if (participant.id !== `${OWNER_NUMBER}@s.whatsapp.net`) {
                            await sock.groupParticipantsUpdate(sender, [participant.id], 'remove');
                        }
                    }
                }
            } catch (error) {
                console.error('حدث خطأ:', error);
            }
        });

        sock.ev.on("creds.update", saveCreds);

    } catch (error) {
        console.error('خطأ فادح:', error);
        process.exit(1); // إغلاق البرنامج عند خطأ غير معالج
    }
}

startSock();
app.listen(port, () => console.log(`الخادم يعمل على http://localhost:${port}`));
