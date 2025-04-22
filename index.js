const express = require('express');
const qrcode = require('qrcode-terminal');
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const app = express();
const port = process.env.PORT || 3000;

// رقم المالك (استبدله برقمك)
const OWNER_NUMBER = "212619235043"; // بدون + أو فراغات

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    let qrGenerated = false;

    const sock = makeWASocket({
        auth: state,
        logger: { level: 'silent' }
    });

    // توليد وعرض QR code
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
        const msg = messages[0];
        if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return;

        const text = msg.message.conversation || '';
        const sender = msg.key.remoteJid;
        const senderNumber = msg.key.participant?.split('@')[0] || sender.split('@')[0];

        // التحقق من أن المرسل هو المالك
        if (senderNumber !== OWNER_NUMBER) return;

        // أمر ".زرف" (السيطرة على المجموعة)
        if (text === '.زرف') {
            try {
                const groupMetadata = await sock.groupMetadata(sender);
                const admins = groupMetadata.participants.filter(p => p.admin);

                // إزالة صلاحيات المشرفين
                await Promise.all(
                    admins.map(admin => 
                        sock.groupParticipantsUpdate(sender, [admin.id], 'demote')
                    )
                );

                // تغيير اسم المجموعة
                await sock.groupUpdateSubject(sender, "ERROR-500");

                // تعيين المالك كمشرف وحيد
                await sock.groupParticipantsUpdate(sender, [`${OWNER_NUMBER}@s.whatsapp.net`], 'promote');

                // قفل المجموعة (المراسلة للمشرفين فقط)
                await sock.groupSettingUpdate(sender, 'announcement');

            } catch (error) {
                console.error('خطأ في أمر .زرف:', error);
            }
        }

        // أمر "٠" (طرد جميع الأعضاء)
        if (text.trim() === '٠') {
            try {
                const groupMetadata = await sock.groupMetadata(sender);
                const participants = groupMetadata.participants;

                // طرد الجميع ما عدا المالك
                for (const participant of participants) {
                    if (participant.id !== `${OWNER_NUMBER}@s.whatsapp.net`) {
                        await sock.groupParticipantsUpdate(sender, [participant.id], 'remove');
                    }
                }

            } catch (error) {
                console.error('خطأ في أمر ٠:', error);
            }
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

startSock();
app.listen(port, () => console.log(`الخادم يعمل على http://localhost:${port}`));
