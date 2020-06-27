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

// takes a telegram file id, downloads the file and uploads it to skynet
async function uploadFile(fileId, filename, ctx) {
  try {
    let reply = await ctx.reply(`Downloading file...`, {
      reply_to_message_id: ctx.message.message_id,
    });
    let url = await ctx.telegram.getFileLink(fileId); // get telegram file url
    let response = await axios.get(url, { responseType: "stream" }); // download file
    ctx.telegram.editMessageText(
      ctx.chat.id,
      reply.message_id,
      null,
      "Uploading to Skynet..."
    );
    // upload to skynet
    axios
      .post(apiUrl + "?filename=" + filename, response.data, {
        maxContentLength: Infinity,
      })
      .then((resp) => {
        if (resp.status !== 200) {
          ctx.telegram.editMessageText(
            ctx.chat.id,
            reply.message_id,
            null,
            "Error while uploading file to skynet ☹️"
          );
        }
        // update reply with skylink
        ctx.telegram.editMessageText(
          ctx.chat.id,
          reply.message_id,
          null,
          `${settings.portalUrl}/${resp.data.skylink}`,
          { disable_web_page_preview: true }
        );
      })
      .catch(console.error);
  } catch (error) {
    console.error(error);
  }
}

// upload string as a textfile to skynet
async function uploadText(ctx) {
  let filename = `text_${new Date().getTime()}.txt`;
  let reply = await ctx.reply(`Uploading text...`, {
    reply_to_message_id: ctx.message.message_id,
  });
  axios
    .post(apiUrl + "?filename=" + filename, ctx.message.text, {
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
}

bot.start((ctx) => ctx.reply(settings.helpMsg));

bot.use(rateLimit(limitConfig));

bot.help((ctx) => ctx.reply(settings.helpMsg));

bot.on("document", async (ctx) => {
  uploadFile(ctx.message.document.file_id, ctx.message.document.file_name, ctx);
});

bot.on("photo", (ctx) => {
  let file = ctx.message.photo.slice(-1).pop().file_id;
  uploadFile(file, `telegram-photo_${ctx.message.date}.jpg`, ctx);
});

bot.on("voice", (ctx) => {
  uploadFile(
    ctx.message.voice.file_id,
    `telegram-audio_${ctx.message.date}.ogg`,
    ctx
  );
});

bot.on("audio", (ctx) => {
  uploadFile(
    ctx.message.audio.file_id,
    `telegram-audio_${ctx.message.date}.mp3`,
    ctx
  );
});

bot.on("video", (ctx) => {
  uploadFile(
    ctx.message.video.file_id,
    `telegram-video_${ctx.message.date}.mp4`,
    ctx
  );
});

bot.on("video_note", (ctx) => {
  uploadFile(
    ctx.message.video_note.file_id,
    `telegram-video_${ctx.message.date}.mp4`,
    ctx
  );
});

bot.on("text", (ctx) => {
  uploadText(ctx);
});

bot.launch().then(() => {
  console.log("Bot ready!");
  console.log(`Add me: https://t.me/${bot.options.username}`);
});
