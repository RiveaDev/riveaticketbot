const {
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../config");

const dbPath = path.join(process.cwd(), "tickets.json");

function readDB() {
  if (!fs.existsSync(dbPath)) return { last: 0, byUser: {}, byChannel: {} };
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}
function writeDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function safeLog(guild, embed) {
  try {
    const ch = await guild.channels.fetch(config.ticketLogChannelId);
    if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (_) {}
  function timeAgoTR(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} saniye önce`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dakika önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

function formatDateTR(ms) {
  const d = new Date(ms);
  // Türkiye formatına yakın
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

}

function ticketButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:claim")
      .setLabel("Yetkili - Sahiplen")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("ticket:close_staff")
      .setLabel("Yetkili - Kapat")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("ticket:close_user")
      .setLabel("Oyuncu - Kapat")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function reopenButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:reopen")
      .setLabel("Ticketi Geri Aç")
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = async function handler(interaction) {
  if (!interaction.inGuild()) return;

  // =========================
  // 1) SELECT MENU -> TICKET AÇ
  // =========================
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket:select") {
    const value = interaction.values[0];

    if (value === "reset") {
      return interaction.reply({ content: "Menü sıfırlandı.", ephemeral: true });
    }

    // DB oku + açık ticket kontrolü
    const db = readDB();
    const existing = db.byUser?.[interaction.user.id];

if (existing?.channelId) {
  const ch = await interaction.guild.channels
    .fetch(existing.channelId)
    .catch(() => null);

  // Kanal yoksa veya ticket kapalıysa → otomatik temizle
  if (!ch || existing.closed) {
    delete db.byUser[interaction.user.id];

    if (db.byChannel?.[existing.channelId]) {
      delete db.byChannel[existing.channelId];
    }

    writeDB(db);
  } else {
    return interaction.reply({
      content: `Zaten açık ticketin var: <#${existing.channelId}>`,
      ephemeral: true,
    });
  }
}


    // kategori bul
    const opt = config.options.find((x) => x.value === value);
    if (!opt) {
      return interaction.reply({ content: "Geçersiz kategori.", ephemeral: true });
    }

    // kanal oluştur
    const channel = await interaction.guild.channels.create({
      name: "ticket-oluşturuluyor",
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: config.staffRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ],
    });

    // ticket numarası
    db.last = (db.last || 0) + 1;
    const num = db.last;

    await channel.setName(config.channelNameFormat(num, interaction.user));

    // embed
    const embed = new EmbedBuilder()
      .setTitle(`${opt.emoji ? `${opt.emoji} ` : ""}${opt.label} Kategorili Destek!`)
      .setDescription(
        `**${interaction.user}** kişisi destek talebi oluşturdu.\n\n` +
          `Oluşturulan destek talebinin bilgilerini aşağıda belirttim;`
      )
      .addFields(
        { name: "👤 Oluşturan Kullanıcı", value: `\`\`\`${interaction.user.username}\`\`\``, inline: false },
        { name: "📁 Kategori", value: `\`\`\`${opt.label}\`\`\``, inline: false },
        { name: "🔴 Durum", value: `\`\`\`🔴 - Yetkili Bekliyor\`\`\``, inline: false }
      )
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
      .setFooter({ text: `${interaction.client.user.username} | Ticket Sistemi.` })
      .setTimestamp();

    // önce mesajı gönder (panel mesajı)
    const firstMsg = await channel.send({
      content: `<@&${config.staffRoleId}>`,
      embeds: [embed],
      components: [ticketButtons(false)],
    });

    // DB’ye kaydet
    db.byUser[interaction.user.id] = {
      channelId: channel.id,
      number: num,
      category: value,
      closed: false,
      claimedBy: null,
      openedAt: Date.now(),
      panelMessageId: firstMsg.id,
    };

    db.byChannel[channel.id] = {
      userId: interaction.user.id,
      number: num,
      category: value,
      closed: false,
      claimedBy: null,
      openedAt: Date.now(),
      panelMessageId: firstMsg.id,
    };

    writeDB(db);

    // log
    await safeLog(
      interaction.guild,
      new EmbedBuilder()
        .setTitle("Ticket Açıldı")
        .addFields(
          { name: "Kanal", value: `<#${channel.id}>`, inline: true },
          { name: "Kullanıcı", value: `${interaction.user} (${interaction.user.id})`, inline: true },
          { name: "Kategori", value: `${opt.label}`, inline: true }
        )
        .setTimestamp()
    );

    return interaction.reply({ content: `✅ Ticket oluşturuldu: <#${channel.id}>`, ephemeral: true });
  }

  // =========================
  // 2) BUTONLAR
  // =========================
  if (!interaction.isButton()) return;

  const db = readDB();
  const t = db.byChannel?.[interaction.channelId];
  if (!t) return interaction.reply({ content: "Bu kanal bir ticket değil.", ephemeral: true });

  const isStaff = interaction.member.roles?.cache?.has(config.staffRoleId);
  const isOwner = interaction.user.id === t.userId;

  const channel = interaction.channel;
  const userId = t.userId;

  // =========================
  // Yetkili - Sahiplen
  // =========================
  if (interaction.customId === "ticket:claim") {
    if (!isStaff) return interaction.reply({ content: "Bu işlem sadece yetkililer içindir.", ephemeral: true });
    if (t.closed) return interaction.reply({ content: "Ticket kapalı. Önce geri açın.", ephemeral: true });
    if (t.claimedBy) return interaction.reply({ content: "Bu ticket zaten sahiplenilmiş.", ephemeral: true });

    // DB güncelle
    t.claimedBy = interaction.user.id;
    db.byChannel[channel.id] = t;
    db.byUser[userId] = { ...db.byUser[userId], claimedBy: interaction.user.id };
    writeDB(db);

    const opt = config.options.find((x) => x.value === t.category);

    const claimedEmbed = new EmbedBuilder()
      .setTitle(`${opt?.emoji ? `${opt.emoji} ` : ""}${opt?.label ?? t.category} Kategorili Destek!`)
      .setDescription(
        `**${interaction.user}** kişisi destek talebi oluşturdu.\n\n` +
          `Oluşturulan destek talebinin bilgilerini aşağıda belirttim;`
      )
      .addFields(
        {
          name: "Oluşturan Kullanıcı:",
          value: `\`${interaction.guild.members.cache.get(userId)?.user?.username ?? "Bilinmiyor"}\``,
          inline: false,
        },
        { name: "Kategori:", value: `\`${opt?.label ?? t.category}\``, inline: false },
        { name: "Durum", value: "🟡 - Yetkili Sahiplendi", inline: false }
      )
      .setFooter({ text: `${interaction.client?.user?.username || "Ticket"} | Ticket Sistemi.` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:claim")
        .setLabel("Yetkili - Sahiplen")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("ticket:close_staff")
        .setLabel("Yetkili - Kapat")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket:close_user")
        .setLabel("Oyuncu - Kapat")
        .setStyle(ButtonStyle.Danger)
    );

    // ✅ doğru alan: panelMessageId
    const panelMsgId = t.panelMessageId || db.byUser?.[userId]?.panelMessageId;

    // panel mesajını edit
    if (panelMsgId) {
      const msg = await channel.messages.fetch(panelMsgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [claimedEmbed], components: [row] }).catch(() => {});
    }

    // bilgilendirme mesajı
    const infoEmbed = new EmbedBuilder()
      .setDescription(`✅ Destek talebi ${interaction.user} tarafından sahiplendi!`)
      .setFooter({ text: `${interaction.client?.user?.username || "Ticket"} | Ticket Sistemi.` });

    await channel.send({ embeds: [infoEmbed] });

    await safeLog(
      interaction.guild,
      new EmbedBuilder()
        .setTitle("Ticket Sahiplenildi")
        .addFields(
          { name: "Kanal", value: `<#${channel.id}>`, inline: true },
          { name: "Kullanıcı", value: `<@${userId}>`, inline: true },
          { name: "Yetkili", value: `${interaction.user}`, inline: true },
          { name: "Kategori", value: `${opt?.label ?? t.category}`, inline: true }
        )
        .setTimestamp()
    );

    return interaction.reply({ content: "✅ Ticket sahiplenildi.", ephemeral: true });
  }

  // =========================
  // Yetkili - Kapat
  // =========================
  if (interaction.customId === "ticket:close_staff") {
    if (!isStaff) return interaction.reply({ content: "Bu işlem sadece yetkililer içindir.", ephemeral: true });
    if (t.closed) return interaction.reply({ content: "Ticket zaten kapalı.", ephemeral: true });

    t.closed = true;
    t.closedBy = interaction.user.id;
    t.closedAt = Date.now();
    db.byChannel[channel.id] = t;
    db.byUser[userId] = { ...db.byUser[userId], closed: true, closedBy: interaction.user.id, closedAt: t.closedAt };
    writeDB(db);

    await channel.permissionOverwrites.edit(userId, { ViewChannel: false }).catch(() => {});

    const embed = new EmbedBuilder()
      .setDescription(`🔒 Ticket ${interaction.user} tarafından kapatıldı.\nKullanıcı artık bu kanalı göremez.`)
      .setFooter({ text: `${interaction.client?.user?.username || "Ticket"} | Ticket Sistemi.` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [reopenButton()] });

    await safeLog(
      interaction.guild,
      new EmbedBuilder()
        .setTitle("Ticket Kapatıldı (Yetkili)")
        .addFields(
          { name: "Kanal", value: `<#${channel.id}>`, inline: true },
          { name: "Kullanıcı", value: `<@${userId}>`, inline: true },
          { name: "Kapatılan Yetkili", value: `${interaction.user}`, inline: true }
        )
        .setTimestamp()
    );
    return;
  }

  // =========================
  // Oyuncu - Kapat
  // =========================
  if (interaction.customId === "ticket:close_user") {
    if (!isOwner) return interaction.reply({ content: "Bu işlem sadece ticket sahibi içindir.", ephemeral: true });
    if (t.closed) return interaction.reply({ content: "Ticket zaten kapalı.", ephemeral: true });

    t.closed = true;
    t.closedBy = interaction.user.id;
    t.closedAt = Date.now();
    db.byChannel[channel.id] = t;
    db.byUser[userId] = { ...db.byUser[userId], closed: true, closedBy: interaction.user.id, closedAt: t.closedAt };
    writeDB(db);

    await channel.permissionOverwrites.edit(userId, { ViewChannel: false }).catch(() => {});

    const embed = new EmbedBuilder()
      .setDescription(`🔒 Ticket ${interaction.user} tarafından kapatıldı.\nKullanıcı artık bu kanalı göremez.`)
      .setFooter({ text: `${interaction.client?.user?.username || "Ticket"} | Ticket Sistemi.` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [reopenButton()] });

    await safeLog(
      interaction.guild,
      new EmbedBuilder()
        .setTitle("Ticket Kapatıldı (Kullanıcı)")
        .addFields(
          { name: "Kanal", value: `<#${channel.id}>`, inline: true },
          { name: "Kullanıcı", value: `<@${userId}>`, inline: true }
        )
        .setTimestamp()
    );
    return;
  }

  // =========================
  // Ticketi Geri Aç
  // =========================
  if (interaction.customId === "ticket:reopen") {
    if (!isStaff) return interaction.reply({ content: "Bu işlem sadece yetkililer içindir.", ephemeral: true });
    if (!t.closed) return interaction.reply({ content: "Ticket zaten açık.", ephemeral: true });

    t.closed = false;
    t.reopenedBy = interaction.user.id;
    t.reopenedAt = Date.now();
    db.byChannel[channel.id] = t;
    db.byUser[userId] = { ...db.byUser[userId], closed: false };
    writeDB(db);

    await channel.permissionOverwrites
      .edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
      .catch(() => {});

    const embed = new EmbedBuilder()
      .setDescription(`✅ Ticket ${interaction.user} tarafından **geri açıldı**.`)
      .setFooter({ text: `${interaction.client?.user?.username || "Ticket"} | Ticket Sistemi.` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [ticketButtons(false)] });

    await safeLog(
      interaction.guild,
      new EmbedBuilder()
        .setTitle("Ticket Geri Açıldı")
        .addFields(
          { name: "Kanal", value: `<#${channel.id}>`, inline: true },
          { name: "Kullanıcı", value: `<@${userId}>`, inline: true },
          { name: "Yetkili", value: `${interaction.user}`, inline: true }
        )
        .setTimestamp()
    );
    return;
  }
};
