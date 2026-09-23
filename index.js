require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});



// ===== JON'S MERCH: STICKY / TRANSCRIPTS / ANNOUNCEMENTS =====
const DATA_FILE = path.join(__dirname, "jon_merch_data.json");
let featureData = { sticky: null, transcriptChannelId: null };
try { featureData = { ...featureData, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; } catch {}
function saveFeatureData() { fs.writeFileSync(DATA_FILE, JSON.stringify(featureData, null, 2)); }

async function registerFeatureCommands() {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) return;
  const commands = [
    { name: "shop", description: "Open the Jon's Merch shop" },
    { name: "sticky", description: "Create or update the sticky message", options: [
      { name: "channel", description: "Channel for the sticky", type: 7, required: true, channel_types: [0] },
      { name: "minutes", description: "How often to repost it", type: 4, required: true, min_value: 1, max_value: 10080 },
      { name: "message", description: "Sticky message", type: 3, required: true, max_length: 4000 }
    ]},
    { name: "unsticky", description: "Remove the current sticky" },
    { name: "settranscripts", description: "Set the ticket transcript channel", options: [
      { name: "channel", description: "Transcript channel", type: 7, required: true, channel_types: [0] }
    ]},
    { name: "announce", description: "Send an announcement", options: [
      { name: "channel", description: "Announcement channel", type: 7, required: true, channel_types: [0] },
      { name: "message", description: "Announcement message", type: 3, required: true, max_length: 4000 },
      { name: "title", description: "Optional title", type: 3, required: false, max_length: 256 },
      { name: "everyone", description: "Mention @everyone", type: 5, required: false }
    ]}
  ];
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID) : Routes.applicationCommands(process.env.CLIENT_ID);
  try { await rest.put(route, { body: commands }); console.log("Feature slash commands registered."); } catch (e) { console.error("Command registration failed:", e); }
}

async function postSticky() {
  const st = featureData.sticky;
  if (!st?.channelId) return;
  const channel = await client.channels.fetch(st.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  if (st.messageId) await channel.messages.delete(st.messageId).catch(() => {});
  const sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(st.message).setColor(0x5865F2).setFooter({ text: "Jon's Merch • Sticky" })] }).catch(() => null);
  if (sent) { st.messageId = sent.id; saveFeatureData(); }
}

function startStickyTimer() {
  if (global.jonStickyTimer) clearInterval(global.jonStickyTimer);
  if (!featureData.sticky?.minutes) return;
  global.jonStickyTimer = setInterval(postSticky, featureData.sticky.minutes * 60 * 1000);
  postSticky();
}

async function createTranscript(channel) {
  const messages = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.sort((a,b) => a.createdTimestamp - b.createdTimestamp);
  const esc = x => String(x ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const rows = messages.map(m => `<div class="msg"><b>${esc(m.author?.tag || "Unknown")}</b> <small>${new Date(m.createdTimestamp).toLocaleString()}</small><br>${esc(m.content || "[embed/attachment]")}${m.attachments?.size ? `<br>Attachments: ${[...m.attachments.values()].map(a=>`<a href="${esc(a.url)}">${esc(a.name || a.url)}</a>`).join(", ")}` : ""}</div>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket Transcript - ${esc(channel.name)}</title><style>body{font-family:Arial;background:#111827;color:#eee;padding:24px}.msg{padding:10px 0;border-bottom:1px solid #374151}small{color:#9ca3af}</style></head><body><h1>Jon's Merch Ticket Transcript</h1><p>Channel: ${esc(channel.name)}</p>${rows}</body></html>`;
}

// ===== PRODUCTS =====
// Update these anytime you want. Prices are in USD cents.
const PRODUCTS = {
  fits: [
    { id: "fit_1", name: "1 Fit", price: 5 },
    { id: "fit_2", name: "2 Fits", price: 9 },
    { id: "fit_3", name: "3 Fits", price: 14 },
    { id: "fit_4", name: "4 Fits", price: 19 },
    { id: "fit_5", name: "5 Fits", price: 24 }
  ],
  decals: [
    { id: "decal_1", name: "1 Decal", price: 1 },
    { id: "decal_3", name: "3 Decals", price: 2 },
    { id: "decal_6", name: "6 Decals", price: 4 },
    { id: "logo", name: "Logo Made By Me", price: 1 }
  ]
};

const PAYMENT_METHODS = ["Cash App", "Apple Pay"];

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function productById(id) {
  return [...PRODUCTS.fits, ...PRODUCTS.decals].find(p => p.id === id);
}

function shopEmbed() {
  return new EmbedBuilder()
    .setTitle("🛍️ JON'S MERCH SHOP")
    .setDescription(
      "Welcome to Jon's Merch Shop!\n\n" +
      "Choose a category below to view the available merch and start an order.\n\n" +
      "👕 **Fits**\n" +
      "🎨 **Decals**\n\n" +
      "Your order will be handled in a private ticket."
    );
}

function shopButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_fits")
      .setLabel("Fits")
      .setEmoji("👕")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("shop_decals")
      .setLabel("Decals")
      .setEmoji("🎨")
      .setStyle(ButtonStyle.Primary)
  );
}

function productMenu(category) {
  const products = PRODUCTS[category];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`product_${category}`)
      .setPlaceholder("Select what you want")
      .addOptions(products.map(p => ({
        label: `${p.name} — ${money(p.price)}`,
        value: p.id
      })))
  );
}

function paymentMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("payment_method")
      .setPlaceholder("Choose a payment method")
      .addOptions(
        PAYMENT_METHODS.map(p => ({
          label: p,
          value: p.toLowerCase().replaceAll(" ", "_"),
          emoji: p === "Cash App" ? "💵" : ""
        }))
      )
  );
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Jon's Merch Shop bot is online.");
  await registerFeatureCommands();
  startStickyTimer();
});

client.on("interactionCreate", async interaction => {
  try {
    // STICKY
    if (interaction.isChatInputCommand() && interaction.commandName === "sticky") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ You need Manage Messages permission.", ephemeral: true });
      const channel = interaction.options.getChannel("channel", true);
      const minutes = interaction.options.getInteger("minutes", true);
      const message = interaction.options.getString("message", true);
      if (featureData.sticky?.channelId && featureData.sticky.messageId) {
        const old = await client.channels.fetch(featureData.sticky.channelId).catch(() => null);
        await old?.messages?.delete(featureData.sticky.messageId).catch(() => {});
      }
      featureData.sticky = { channelId: channel.id, minutes, message, messageId: null };
      saveFeatureData(); startStickyTimer();
      return interaction.reply({ content: `📌 Sticky set in ${channel} every **${minutes} minute(s)**.`, ephemeral: true });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "unsticky") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ You need Manage Messages permission.", ephemeral: true });
      if (featureData.sticky?.channelId && featureData.sticky.messageId) { const old = await client.channels.fetch(featureData.sticky.channelId).catch(() => null); await old?.messages?.delete(featureData.sticky.messageId).catch(() => {}); }
      featureData.sticky = null; saveFeatureData(); if (global.jonStickyTimer) clearInterval(global.jonStickyTimer);
      return interaction.reply({ content: "📌 Sticky removed.", ephemeral: true });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "settranscripts") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "❌ You need Manage Channels permission.", ephemeral: true });
      const channel = interaction.options.getChannel("channel", true); featureData.transcriptChannelId = channel.id; saveFeatureData();
      return interaction.reply({ content: `📄 Ticket transcripts will be sent to ${channel}.`, ephemeral: true });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "announce") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "❌ You need Manage Messages permission.", ephemeral: true });
      const channel = interaction.options.getChannel("channel", true); const message = interaction.options.getString("message", true); const title = interaction.options.getString("title") || "📢 Announcement"; const everyone = interaction.options.getBoolean("everyone") || false;
      const embed = new EmbedBuilder().setTitle(title).setDescription(message).setColor(0x5865F2).setFooter({ text: "Jon's Merch" }).setTimestamp();
      await channel.send({ content: everyone ? "@everyone" : undefined, allowedMentions: { parse: everyone ? ["everyone"] : [] }, embeds: [embed] });
      return interaction.reply({ content: `📢 Announcement sent to ${channel}.`, ephemeral: true });
    }

    // /shop
    if (interaction.isChatInputCommand() && interaction.commandName === "shop") {
      await interaction.reply({
        embeds: [shopEmbed()],
        components: [shopButtons()]
      });
      return;
    }

    // Category buttons
    if (interaction.isButton() && ["shop_fits", "shop_decals"].includes(interaction.customId)) {
      const category = interaction.customId === "shop_fits" ? "fits" : "decals";
      const title = category === "fits" ? "👕 Fits" : "🎨 Decals";

      await interaction.reply({
        ephemeral: true,
        content: `**${title}**\nSelect an option below:`,
        components: [productMenu(category)]
      });
      return;
    }

    // Product selection -> ask for quantity/details
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("product_")) {
      const product = productById(interaction.values[0]);
      if (!product) return interaction.reply({ ephemeral: true, content: "That product is no longer available." });

      const modal = new ModalBuilder()
        .setCustomId(`order_modal_${product.id}`)
        .setTitle(`Order: ${product.name}`);

      const quantity = new TextInputBuilder()
        .setCustomId("quantity")
        .setLabel("Quantity")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1")
        .setValue("1")
        .setRequired(true);

      const details = new TextInputBuilder()
        .setCustomId("details")
        .setLabel("Design / order details")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Tell Jon what you want made...")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(quantity),
        new ActionRowBuilder().addComponents(details)
      );

      await interaction.showModal(modal);
      return;
    }

    // Modal -> payment selection
    if (interaction.isModalSubmit() && interaction.customId.startsWith("order_modal_")) {
      const product = productById(interaction.customId.replace("order_modal_", ""));
      const quantityRaw = interaction.fields.getTextInputValue("quantity");
      const quantity = Number.parseInt(quantityRaw, 10);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        await interaction.reply({ ephemeral: true, content: "Please enter a quantity from 1 to 100." });
        return;
      }

      const details = interaction.fields.getTextInputValue("details") || "No additional details.";
      const total = product.price * quantity;

      // Store the pending order on the interaction user temporarily in memory.
      client.pendingOrders ??= new Map();
      client.pendingOrders.set(interaction.user.id, {
        product,
        quantity,
        details,
        total
      });

      await interaction.reply({
        ephemeral: true,
        content: `**${product.name} × ${quantity}**\nTotal: **${money(total)}**\n\nChoose your payment method:`,
        components: [paymentMenu()]
      });
      return;
    }

    // Payment -> create private ticket
    if (interaction.isStringSelectMenu() && interaction.customId === "payment_method") {
      const order = client.pendingOrders?.get(interaction.user.id);
      if (!order) {
        await interaction.reply({ ephemeral: true, content: "Your order session expired. Please start again with /shop." });
        return;
      }

      const payment = interaction.values[0] === "cash_app" ? "Cash App" : "Apple Pay";
      const guild = interaction.guild;

      const staffRoleId = process.env.STAFF_ROLE_ID;
      const ticketCategoryId = process.env.TICKET_CATEGORY_ID;

      if (!staffRoleId || !ticketCategoryId) {
        await interaction.reply({
          ephemeral: true,
          content: "The bot is missing STAFF_ROLE_ID or TICKET_CATEGORY_ID in the environment variables."
        });
        return;
      }

      const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "customer";
      const channel = await guild.channels.create({
        name: `order-${safeName}`,
        type: ChannelType.GuildText,
        parent: ticketCategoryId,
        topic: interaction.user.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: staffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: interaction.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
          }
        ]
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );

      const cashApp = process.env.CASHAPP_TAG || "ADD_CASHAPP_TAG";
      const applePay = process.env.APPLE_PAY_INFO || "Send Apple Pay details here.";

      const paymentInfo = payment === "Cash App"
        ? `**Cash App:** ${cashApp}`
        : `**Apple Pay:** ${applePay}`;

      const embed = new EmbedBuilder()
        .setTitle("🛒 New Merch Order")
        .addFields(
          { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Product", value: order.product.name, inline: true },
          { name: "Quantity", value: String(order.quantity), inline: true },
          { name: "Total", value: money(order.total), inline: true },
          { name: "Payment Method", value: payment, inline: true },
          { name: "Design / Details", value: order.details.slice(0, 1024) }
        )
        .setDescription(paymentInfo);

      await channel.send({
        content: `<@${interaction.user.id}> <@&${staffRoleId}>`,
        embeds: [embed],
        components: [closeRow]
      });

      client.pendingOrders.delete(interaction.user.id);

      await interaction.reply({
        ephemeral: true,
        content: `✅ Your order ticket is ready: ${channel}`
      });
      return;
    }

    // Close ticket
    if (interaction.isButton() && interaction.customId === "close_ticket") {
      const staffRoleId = process.env.STAFF_ROLE_ID;
      const isStaff = Boolean(staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId));
      const isTicketOwner = interaction.channel?.topic === interaction.user.id;

      if (!isStaff && !isTicketOwner) {
        await interaction.reply({ ephemeral: true, content: "You cannot close this ticket." });
        return;
      }

      await interaction.reply({ content: "🔒 Closing this ticket in 5 seconds..." });
      const transcriptChannel = featureData.transcriptChannelId ? await client.channels.fetch(featureData.transcriptChannelId).catch(() => null) : null;
      if (transcriptChannel?.isTextBased()) {
        const html = await createTranscript(interaction.channel);
        const filePath = path.join(__dirname, `transcript-${interaction.channel.id}.html`);
        fs.writeFileSync(filePath, html);
        await transcriptChannel.send({ content: `📄 **Ticket Transcript** — \`${interaction.channel.name}\``, files: [filePath] }).catch(console.error);
        fs.unlink(filePath, () => {});
      }
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: "Something went wrong. Check the Railway logs." }).catch(() => {});
    }
  }
});


client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("Discord login failed:", err);
  process.exit(1);
});
