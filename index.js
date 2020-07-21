const { Telegraf } = require("telegraf");
const axios = require("axios").default;
const settings = require("./settings");
const rateLimit = require("telegraf-ratelimit");

const apiUrl = settings.portalUrl + "/skynet/skyfile";
const bot = new Telegraf(settings.telegramBotToken);

// empty albums object used to store multiple photos and videos from an album
let albums = {};

// config for telegraf ratelimit middleware
const limitConfig = {
  window: settings.rateLimitTime,
  limit: 1,
  onLimitExceeded: (ctx) => {
    if (ctx.message.media_group_id) return handleMediaGroup(ctx);
    ctx.reply(
      `Rate limit exceeded. Max 1 upload per ${settings.rateLimitTime / 1000}s`
    );
  },
};

function filesToBlobs(files, ctx) {
  return new Promise((resolve, reject) => {
    if (!files || files.length < 2) return reject("No files provided.");
    let fileBlobs = [];
    files.forEach(async (fileId) => {
      try {
        let url = await ctx.telegram.getFileLink(fileId); // get telegram file url
        axios.get(url, { responseType: "stream" }).then((response) => {
          fileBlobs.push(response.data);
          if (fileBlobs.length === files.length) resolve(fileBlobs);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// uploads all files from an media group to skygallery
async function uploadAlbum(id, ctx) {
  let reply;
  try {
    reply = await ctx.reply(
      `Uploading ${albums[id].files.length} files to SkyGallery...`
    );
    let blobs = await filesToBlobs(albums[id].files, ctx);
    ctx.telegram.editMessageText(
      ctx.chat.id,
      reply.message_id,
      null,
      `${blobs.length} files downloaded.`
    );
    delete albums[id];
  } catch (error) {
    console.error(error);
    delete albums[id];
    if (!reply) return;
    ctx.telegram.editMessageText(
      ctx.chat.id,
      reply.message_id,
      null,
      "Error while uploading files to skynet ☹️"
    );
  }
}

// pushes all media ids of a media group in an object
function handleMediaGroup(ctx) {
  const media_group_id = ctx.message.media_group_id;
  if (!albums[media_group_id]) albums[media_group_id] = { files: [] };
  let album = albums[ctx.message.media_group_id];

  if (album.timeout) clearTimeout(album.timeout);
  album.timeout = setTimeout(uploadAlbum, 100, media_group_id, ctx);

  if (ctx.message.photo) {
    let file = ctx.message.photo.slice(-1).pop().file_id;
    album.files.push(file);
  } else if (ctx.message.video) {
    album.files.push(ctx.message.video.file_id);
  }
}

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
    if (!reply) return;
    ctx.telegram.editMessageText(
      ctx.chat.id,
      reply.message_id,
      null,
      "Error while uploading file to skynet ☹️"
    );
    // handle telegram 20mb donwload filesize limit
    if (error.message === "400: Bad Request: file is too big") {
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
  let reply;
  try {
    reply = await ctx.reply(`Uploading text...`, {
      reply_to_message_id: ctx.message.message_id,
    });
    let filename = `text_${new Date().getTime()}.txt`;
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
      });
  } catch (error) {
    if (!reply) return;
    console.error(error);
    ctx.telegram.editMessageText(
      ctx.chat.id,
      reply.message_id,
      null,
      "Error while uploading text to skynet ☹️"
    );
  }
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
  if (ctx.message.media_group_id) return handleMediaGroup(ctx);
  let file = ctx.message.photo.slice(-1).pop().file_id;
  uploadFile(file, `telegram-photo_${ctx.message.date}.jpg`, ctx);
});

bot.on("video", (ctx) => {
  if (ctx.message.media_group_id) return handleMediaGroup(ctx);
  uploadFile(
    ctx.message.video.file_id,
    `telegram-video_${ctx.message.date}.mp4`,
    ctx
  );
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

bot.on("video_note", (ctx) => {
  uploadFile(
    ctx.message.video_note.file_id,
    `telegram-video_${ctx.message.date}.mp4`,
    ctx
  );
});

bot.on("sticker", (ctx) => {
  const filename = ctx.message.sticker.is_animated
    ? `animated-telegram-sticker_${ctx.message.date}.tgs`
    : `telegram-sticker_${ctx.message.date}.webp`;
  uploadFile(ctx.message.sticker.file_id, filename, ctx);
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
