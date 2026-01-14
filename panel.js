const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const config = require("../config");

module.exports = async function sendTicketPanel(channel) {
  // 1) BÜYÜK RESİM (logo/banner)
  const IMAGE_URL = "https://media.discordapp.net/attachments/1455297988678123708/1460817868802490418/scarface-tony-montana-al-pacino-men-film-stills-hd-wallpaper-preview.jpg?ex=69684c28&is=6966faa8&hm=b5d6e3574a24ec003861c294ad2d8be8fe2c2c28ab0406721e5e605045da4a0b&=&format=webp";

  // 2) SAĞ ÜST KÜÇÜK RESİM (thumbnail)
  const THUMB_URL = "https://media.discordapp.net/attachments/1455297988678123708/1460818956129538205/image0.webp?ex=69684d2b&is=6966fbab&hm=7e64f5c28e16778fefec3c1fb5a50b0580c832746d39a1f6211c8592d1f6a831&=&format=webp";

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setAuthor({
      name: "Eyes Of Dia", // burayı "Kateshi Video" gibi yapabilirsin
      iconURL: channel.guild.iconURL({ dynamic: true }) || undefined,
    })
    .setTitle("Destek Sistemi")
    .setDescription(
      "✨ **Destek Sistemi Hakkında:**\n" +
      "Aşağıdaki seçeneklerden uygun olanı seçerek\n" +
      "hemen bir ticket oluşturabilirsiniz.\n\n" +
      "🔗 **Sunucu Bilgisi:**\n" +
      "Sunucumuzun kurallarını okumayı unutmayın."
    )
    .setThumbnail(THUMB_URL)
    .setImage(IMAGE_URL)
    .setFooter({ text: "Eyes Of Dia Bot's | Ticket Sistemi." });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket:select")
    .setPlaceholder("Ticket Açmak İçin Kategori Seçiniz.")
    .addOptions(
      config.options.map((o) => ({
        label: o.label,
        value: o.value,
        description: o.description,
        emoji: o.emoji,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);
    // Aynı paneli tekrar tekrar atma (kanalda daha önce atıldıysa çık)
  const old = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (old) {
    const already = old.find(m =>
      m.author?.id === channel.client.user.id &&
      m.components?.[0]?.components?.[0]?.customId === "ticket:select"
    );
    if (already) return; // panel zaten var
  }
  await channel.send({ embeds: [embed], components: [row] });
};
