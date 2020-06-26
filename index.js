const { Telegraf } = require("telegraf");
const axios = require("axios").default;
const settings = require("./settings");

const apiUrl = settings.portalUrl + "/skynet/skyfile";
const bot = new Telegraf(settings.telegramBotToken);

bot.start((ctx) =>
  ctx.reply("Send me a file or text and I will upload it to SkyPortal.xyz!")
);
bot.help((ctx) =>
  ctx.reply("Send me a file or text and I will upload it to SkyPortal.xyz!")
);
bot.on("document", (ctx) => {
  ctx.telegram
    .getFileLink(ctx.message.document.file_id)
    .then(async (url) => {
      console.log(`Downloading ${url}`);
      let reply = await ctx.reply(`Downloading file...`, {
        reply_to_message_id: ctx.message.message_id,
      });
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
            .post(
              apiUrl + "?filename=" + ctx.message.document.file_name,
              response.data
            )
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
});
bot.launch();
