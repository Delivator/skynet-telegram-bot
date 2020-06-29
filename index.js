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
  let reply;
  try {
    reply = await ctx.reply(`Downloading file...`, {
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
    // handle telegram 20mb donwload filesize limit
    if (error.message === "400: Bad Request: file is too big") {
      if (!reply) return;
      ctx.telegram.editMessageText(
        ctx.chat.id,
        reply.message_id,
        null,
        "Error: File too big.\nTelegram has a 20MB filesize limit for bots."
      );
    } else console.error(error);
  }
}

// upload string as a textfile to skynet
async function uploadText(ctx) {
  let filename = `text_${new Date().getTime()}.txt`;
  let reply = await ctx
    .reply(`Uploading text...`, {
      reply_to_message_id: ctx.message.message_id,
    })
    .catch(console.error);
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

// telegraf bot events
bot.start((ctx) =>
  ctx.reply(settings.startMsg, { disable_web_page_preview: true })
);

bot.use(rateLimit(limitConfig));

bot.help((ctx) => ctx.reply(settings.helpMsg));

bot.command("source", (ctx) => {
  ctx.reply("Source code: https://github.com/Delivator/skynet-telegram-bot");
});

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

bot.catch((err, ctx) => {
  console.log(`Telegraf encountered an error for ${ctx.updateType}`, err);
});

// start telegraf bot
bot.launch().then(async () => {
  const commands = [
    {
      command: "help",
      description: "Show help message",
    },
    {
      command: "source",
      description: "Show GitHub link",
    },
  ];

  // Check if the bot has commands set, if not apply the default commands above
  if ((await bot.telegram.getMyCommands()).length < 1) {
    console.log("No commands found, adding default");
    await bot.telegram
      .setMyCommands(commands)
      .then(() => console.log("Commands set"))
      .catch(console.error);
  }
  console.log("Bot ready!");
  console.log(`Add me: https://t.me/${bot.options.username}`);
});
