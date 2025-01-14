const express = require('express');
const app = express();
const axios = require('axios');
const connectToDatabase = require('./database');
const {Telegraf} = require('telegraf');
require('dotenv').config();
const {Markup} = require('telegraf');
const files = require('./files');
const generateRedeemCode = require('./generatecode');

app.get('/health', (req, res) => {
    res.sendStatus(200);
});

const contactLink = process.env.contactLink

connectToDatabase()
    .then((db) => {
        db.collection('users').createIndex({userId: 1});
        app.locals.db = db;
        console.log('Connected to the database');
    })
    .catch((error) => {
        console.error('Failed to connect to the database:', error);
        process.exit(1);
    });


const bot = new Telegraf(process.env.botToken);
bot.startPolling();

let contactDetails = process.env.contactDetails;

bot.start(async (ctx) => {
    const user = ctx.from;
    const userId = user.id;
    const db = app.locals.db
    const users = await db.collection('users');

    // Find user in the database
    const userDoc = await users.findOne({userId});

    // Check if user is found in the database
    if (userDoc) {
        const {groupSubscription, coins} = userDoc;

        // Check if values are undefined and set them to default if necessary
        if (groupSubscription === undefined) {
            await users.updateOne({userId}, {$set: {groupSubscription: 'none'}});
        }
        if (coins === undefined) {
            await users.updateOne({userId}, {$set: {coins: 0}});
        }
    } else {
        // User not found, insert new document with default fields
        await users.insertOne({userId, groupSubscription: 'none', coins: 0});
    }
    // Generate the keyboard markup
    const keyboardMarkup = {
        keyboard: [
            ['My Info', 'Contact']
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
    };

    // Retrieve user information from the database or use default values
    const {groupSubscription = 'none', coins = 0} = userDoc || {};

    // Send the welcome message with user information and buttons
    return ctx.replyWithHTML(
        `<em>Bem-vindo(a) <b>${user.first_name}</b> ao JR.IMAGE STOCK bot!\n\n<b>Suas Informações:</b>\n<b>Saldo:</b> <code>${coins}</code></em>\n\n<b></b>`,
        {
            reply_markup: keyboardMarkup
        }
    );
});

bot.hears('🔙', async (ctx) => {
    const keyboardMarkup = {
        keyboard: [
            ['My Info', 'Contact']
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
    };


    // Send the welcome message with user information and buttons
    return ctx.replyWithHTML(`<b>Choose an option</b>`, {
        reply_markup: keyboardMarkup,
        reply_to_message_id: ctx.message.message_id
    })
});

bot.hears('My Info', async (ctx) => {
    const userId = ctx.from.id;
    const db = await connectToDatabase();
    const users = await db.collection('users');
    const user = await users.findOne({userId});
    if (!user) {
        return ctx.replyWithHTML(`<em><b>Oh não! Parece que você ainda não se registrou conosco. Mas não se preocupe, estamos aqui para orientá-lo no processo! Para começar, basta enviar o "<code>/start</code>" comando e nosso sistema processará o restante. Mal podemos esperar para que você se junte à nossa comunidade!</b></em>`)
    }
    return ctx.replyWithHTML(`<em><b>Suas Informações:</b>\n<b>Saldo:</b> <code>${user.coins}</code></em>`);
});

bot.hears('Pricing', async (ctx) => {

    ctx.replyWithHTML(`<b>Nossos Preços:</b>\n\n<code>1 Coin = 1$ or ₹90</code>\n\n<b>Aceitamos Pagamentos via:</b>\n<code>Pix</code>\n<code>Nubank</code>\n<code>Mercado Pago</code>\n\n<b>Para comprar créditos entre em contato conosco, clicando no botão abaixo.</b>`, {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Contact 💬',
                        url: contactLink
                    }
                ]
            ]
        }});
});

bot.hears('Bot updates', async (ctx) => {
    const channelLink = 'https://t.me/xbotsSupport'
    ctx.replyWithHTML(`<b>Join our channel for bot updates and source code</b>\n\n<code>join using the button below</code>`, {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Join 📢',
                        url: channelLink
                    }
                ]
            ]
        }});
});

bot.hears('Contact', async (ctx) => {
    return ctx.replyWithHTML(`<b><em>${contactDetails}</em></b>`);
});

bot.hears('Files', async (ctx) => {
    const filesPerPage = 3; // Number of files per row
    const fileKeys = Object.keys(files);

    // Generate the keyboard markup dynamically based on the files object
    const keyboardMarkup = {
        keyboard: [],
        resize_keyboard: true,
        one_time_keyboard: true,
    };

    let row = [];
    fileKeys.forEach((file, index) => {
        row.push(file);

        // Check if the row is complete or if it's the last file
        if (row.length === filesPerPage || index === fileKeys.length - 1) {
            keyboardMarkup.keyboard.push(row);
            row = [];
        }
    });

    // Add the last row with the additional buttons
    keyboardMarkup.keyboard.push(['🔙']);

    // Send the welcome message with file options
    return ctx.replyWithHTML(`<b>Selecione um arquivo para baixar</b>`,
        {
            reply_markup: keyboardMarkup, reply_to_message_id: ctx.message.message_id
        }
    );
});

bot.hears(Object.keys(files), async (ctx) => {
    const userId = ctx.from.id;
    const selectedFile = ctx.message.text;
    const {price, delivery, license, types, link} = files[selectedFile];

    const purchaseConfirmation = await ctx.replyWithHTML(
        `<b>Informações do arquivo:</b>\n<em>Você optou por comprar um arquivo de ${selectedFile} pelo preço de ${price} coins.</em>\n\n<b>Detalhes:</b>\n\n<code>-License Type: ${license}</code>\n<code>-Delivery: ${delivery}</code>\n\n<em><b>Please Note: <code>${types}</code></b></em>\n\n<b>❗Important❗</b>\n<b>link Format: ${link}</b>`
    );
});


bot.command('redeem', async (ctx) => {
    // Get the redeem code from the command arguments
    const code = ctx.message.text.split(' ')[1];

    // Connect to the database and get the redeem_code collection
    const db = await connectToDatabase();
    const redeemCodeCollection = db.collection('redeem_code');
    const usersCollection = db.collection('users');

    // Find the redeem code in the database
    const redeemCodeDoc = await redeemCodeCollection.findOne({code});

    // Check if redeem code exists
    if (!redeemCodeDoc) {
        ctx.reply('Invalid redeem code');
        return;
    }

    // Check if redeem code status is active
    if (redeemCodeDoc.status !== 'active') {
        ctx.reply('Redeem code is not active');
        return;
    }

    // Get the user ID
    const userId = ctx.from.id;

    // Get the user document from the database
    const userDoc = await usersCollection.findOne({userId});

    // Get the user's currently available coins
    const currentCoins = parseFloat(userDoc.coins) || 0;

    // Get the coins available in the redeem code
    const redeemCoins = parseFloat(redeemCodeDoc.coins);

    // Calculate the total coins after redeeming
    const totalCoins = currentCoins + redeemCoins;

    // Update the user's available coins in the database
    await usersCollection.updateOne({userId}, {$set: {coins: totalCoins}});

    // Update the redeem code status to redeemed and inactive
    await redeemCodeCollection.updateOne({code}, {$set: {status: 'redeemed', coins: 0}});
    // await redeemCodeCollection.updateOne({ code }, { $set: { status: 'inactive' } });

    // Send a reply to the user
    ctx.replyWithHTML(`<b>Redeem code successfully redeemed! Your total coins:</b> <code>${totalCoins}</code>`, {reply_to_message_id: ctx.message.message_id});
});

bot.command('gen', async (ctx) => {
    const userid = ctx.from.id;
    const adminId = parseInt(process.env.admin);
    if (userid !== adminId) {
        return ctx.replyWithHTML(`<b>You're not an admin!</b>`)
    }
    const rawCoins = ctx.message.text.split(' ')[1];
    if (isNaN(rawCoins)) {
        return ctx.replyWithHTML(`<b>Quantidade de moedas inválida! A quantidade de moedas deve ser um número!</b>`);
    }
    const coins = parseFloat(rawCoins).toFixed(2);
    const code = await generateRedeemCode(coins);
    return await ctx.replyWithHTML(`<b>Código de resgate gerado com sucesso:</b>\n\n<b>Code: </b><code>${code}</code>\n<b>Coins:</b> <code>${coins}</code>\n\n<b>Redeem code by copy and paste this:</b>\n<code>/redeem ${code}</code>`);
});

// Create a broadcast command to braod cast messages among users
bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id;
    const adminId = parseInt(process.env.admin);
    if (userId !== adminId) {
        return ctx.replyWithHTML(`<b>You're not an admin!</b>`);
    }
    const message = ctx.message.text.split(' ').slice(1).join(' ');
    // Get all the users from the database
    const db = app.locals.db;
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}).toArray();
    users.forEach((user) => {
        ctx.telegram.sendMessage(user.userId, message);
    });
});

bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const rawLink = ctx.message.text;
        if (!rawLink.includes('https://')) {
            return;
        }
        const pleasewait = await ctx.replyWithHTML('<b>Por favor, aguarde enquanto eu processo sua solicitação...</b>', {
            reply_to_message_id: ctx.message.message_id
        });
        const domain = Object.keys(files).find((key) => rawLink.includes(files[key].domain));
        if (!domain) {
            ctx.telegram.editMessageText(pleasewait.chat.id, pleasewait.message_id, undefined, `<b>Oh não! Parece que o link que você enviou não é compatível com nosso sistema. Por favor, entre em contato com o @JRIMAGE.</b>`, {parse_mode: 'HTML'})
            return;
        }
        try {
            const file = files[domain];
            const price = file.price;
            let downloadFunction = eval(file.download);
            const result = await downloadFunction(userId, price, rawLink, ctx);
            if (result.success) {
                const charge = await chargeUser(userId, price);
                ctx.telegram.editMessageText(pleasewait.chat.id, pleasewait.message_id, undefined,`<b>O seu pedido foi processado. Aqui está o link para download.\n\nRemaining Coins: <code>${charge.coins}</code> </b>`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'Download',
                                    url: result.downloadLink
                                }
                            ]
                        ]
                    }, parse_mode: 'HTML'
                })
            } else {
                ctx.telegram.editMessageText(pleasewait.chat.id, pleasewait.message_id, undefined,`<b>Oh não! Algo deu errado com sua compra. Por favor, entre em contato com o @JRIMAGE.\n\n${result.downloadLink}</b>`, {parse_mode: 'HTML'})
            }
        } catch (error) {
            // console.log(error);
            ctx.telegram.editMessageText(pleasewait.chat.id, pleasewait.message_id, undefined,`<b>Oh não! Algo deu errado com sua compra. Por favor, entre em contato com o @JRIMAGE.\n\n${error}</b>`, {parse_mode: 'HTML'})
        }
    }
)

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

// functions

async function coinsVerify(userId, price) {
    const db = app.locals.db;
    try {
        const users = db.collection('users');
        const user = await users.findOne({userId});

        if (!user) {
            throw new Error('Usuário não encontrado');
        }

        const userCoins = parseFloat(user.coins); // Convert coins to a numeric type

        if (isNaN(userCoins) || userCoins < price) {
            throw new Error('Moedas insuficientes');
        }
        return {success: true, message: 'Verificação bem-sucedida'};
    } catch (error) {
        return {success: false, message: error.message};
    }
}

async function chargeUser(userId, price) {
    const db = app.locals.db;
    const users = db.collection('users');
    const user = await users.findOne({userId});

    if (!user) {
        throw new Error('User not found');
    }

    const userCoins = parseFloat(user.coins); // Convert coins to a numeric type

    if (isNaN(userCoins) || userCoins < price) {
        throw new Error('Moedas insuficientes');
    }

    const updatedCoins = (userCoins - price).toFixed(2); // Round the result to 2 decimal places

    const session = db.client.startSession();

    try {
        session.startTransaction();

        await users.updateOne(
            {userId},
            {$set: {coins: updatedCoins}}, // Update coins with the rounded result
            {session}
        );

        await session.commitTransaction();
        return {success: true, message: 'Payment successful', coins: updatedCoins};
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
}

async function instantDownload(userId, price, rawLink) {
    try {
        const verify = await coinsVerify(userId, price);
        if (!verify.success) {
            throw new Error(verify.message);
        }
        const result = await axios.get(`https://main-server-v2-j73uk.ondigitalocean.app/api?apiKey=${process.env.apiKey}&url=${rawLink}`)
        if (!result.data.success) {
            console.log(result.data);
            throw new Error(result.data.downloadLink);
        }
        return result.data;
    } catch (error) {
        throw error;
    }
}

async function outOfStock(userId, price, rawLink) {
    return {
        success: false,
        downloadLink: 'Desculpe, este item está fora de estoque. Por favor, entre em contato com o @JRIMAGE.'
    }
}

