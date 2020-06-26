const { Telegraf } = require("telegraf");
const axios = require("axios").default;
const settings = require("./settings");
const rateLimit = require("telegraf-ratelimit");

const apiUrl = settings.portalUrl + "/skynet/skyfile";
const bot = new Telegraf(settings.telegramBotToken);

// config for telegraf ratelimit middleware
const limitConfig = {
  window: settings.rateLimitTime,
  limit: 1,
  onLimitExceeded: (ctx) =>
    ctx.reply(
      `Rate limit exceeded. Max 1 upload per ${settings.rateLimitTime / 1000}s`
    ),
};

async function uploadFile(fileId, filename, ctx) {
  let reply = await ctx.reply(`Downloading file...`, {
    reply_to_message_id: ctx.message.message_id,
  });
  ctx.telegram
    .getFileLink(fileId)
    .then((url) => {
      axios
        .get(url, { responseType: "arraybuffer" })
        .then((response) => {
          ctx.telegram.editMessageText(
            ctx.chat.id,
            reply.message_id,
            null,
            "Uploading to Skynet..."
          );
          axios
            .post(apiUrl + "?filename=" + filename, response.data, {
              maxContentLength: Infinity,
            })
            .then((resp) => {
              ctx.telegram.editMessageText(
                ctx.chat.id,
                reply.message_id,
                null,
                `${settings.portalUrl}/${resp.data.skylink}`,
                { disable_web_page_preview: true }
              );
            })
            .catch(console.error);
        })
        .catch(console.error);
    })
    .catch(console.error);
}

async function uploadText(ctx) {
  let filename = `text_${new Date().getTime()}.txt`;
  let reply = await ctx.reply(`Uploading text...`, {
    reply_to_message_id: ctx.message.message_id,
  });
  axios
    .post(apiUrl + "?filename=" + filename, ctx.message.text, {
      maxContentLength: Infinity,
      // headers: { "content-type": "plain/text" },
    })
    .then((resp) => {
      ctx.telegram.editMessageText(
        ctx.chat.id,
        reply.message_id,
        null,
        `${settings.portalUrl}/${resp.data.skylink}`,
        { disable_web_page_preview: true }
      );
    })
    .catch(console.error);
}

bot.start((ctx) => ctx.reply(settings.helpMsg));

bot.use(rateLimit(limitConfig));

bot.help((ctx) => ctx.reply(settings.helpMsg));

bot.on("document", async (ctx) => {
  uploadFile(ctx.message.document.file_id, ctx.message.document.file_name, ctx);
});

bot.on("photo", (ctx) => {
  let file = ctx.message.photo.slice(-1).pop().file_id;
  uploadFile(file, `photo_${ctx.message.date}.jpg`, ctx);
});

bot.on("voice", (ctx) => {
  uploadFile(ctx.message.voice.file_id, `audio_${ctx.message.date}.ogg`, ctx);
});

bot.on("video", (ctx) => {
  uploadFile(ctx.message.video.file_id, `video_${ctx.message.date}.mp4`, ctx);
});

bot.on("text", (ctx) => {
  uploadText(ctx);
});

bot.launch();
