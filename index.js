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
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

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
          emoji: p === "Cash App" ? "💵" : "💳"
        }))
      )
  );
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Jon's Merch Shop bot is online.");
});

client.on("interactionCreate", async interaction => {
  try {
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

      const staffRoleIds = (process.env.STAFF_ROLE_IDS || process.env.STAFF_ROLE_ID || '')
        .split(',').map(id => id.trim()).filter(Boolean);
      const ticketCategoryId = process.env.TICKET_CATEGORY_ID;

      if (staffRoleIds.length === 0 || !ticketCategoryId) {
        await interaction.reply({
          ephemeral: true,
          content: "The bot is missing STAFF_ROLE_IDS or TICKET_CATEGORY_ID in the environment variables."
        });
        return;
      }

      const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "customer";
      const channel = await guild.channels.create({
        name: `order-${safeName}`,
        type: ChannelType.GuildText,
        parent: ticketCategoryId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          ...staffRoleIds.map(roleId => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          })),
          {
            id: guild.members.me.id,
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
        content: `<@${interaction.user.id}> ${staffRoleIds.map(id => `<@&${id}>`).join(' ')}`,
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
      const member = interaction.member;
      const staffRoleIds = (process.env.STAFF_ROLE_IDS || process.env.STAFF_ROLE_ID || '')
        .split(',').map(id => id.trim()).filter(Boolean);
      const isStaff = staffRoleIds.some(roleId => member.roles.cache.has(roleId));

      // Ticket creator is identified from the channel's permission overwrites.
      const isCustomer = interaction.channel.permissionOverwrites.cache.some(
        overwrite => overwrite.id === interaction.user.id &&
          overwrite.allow.has(PermissionFlagsBits.ViewChannel)
      );

      if (!isStaff && !isCustomer) {
        await interaction.reply({ ephemeral: true, content: "You don't have permission to close this ticket." });
        return;
      }

      await interaction.reply({ content: "🔒 Closing this ticket in 5 seconds..." });
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

client.login(process.env.DISCORD_TOKEN).catch(console.error);
