const log4js = require('log4js');
const telegram = require('telegram-bot-api');
const coinbene = require('./api/coinbene/api');
const Binance = require('binance-api-node').default

const binance = Binance({
    apiKey: '2h5bOYZRooqRYMIAvptGUyzPMZMNaPjstuX3iSZD8iRax3NT6gCdFZivrVCo9qT2',
    apiSecret: 'lifc38tPiU1VBm3r2F9dnje6F0ZKqJyp0fkdjB0h9Lk43yUaM5KI1I545zODKp9b',
    useServerTime: true
})

//Coinbene Keys
const CoinbeneApiid = "056f4bc8ccecf181915f311ff9aa685a";
const CoinbeneSecret = "87b586ba06c04af9b3bcbfa9961c9165";

// telegram

var api = new telegram({
    token: '714326199:AAGJ8bkWa51r19U-1P8GnA0SL9uOTh-p9RE'
});


// config panel
const depth = 5;
const symbol = "ETHBTC";
const maxVolume =2.0; 
const minVolume = 0.04;
const persentGuard = 0.15

var dateStart;

; (async () => {

    log4js.configure({
        appenders: {
            multi: { type: 'multiFile', base: 'logs/', property: 'categoryName', extension: '.log' }

        },
        categories: {
            default: { appenders: ['multi'], level: 'info' }
        }
    })

       await main();

})()

async function main() {
    dateStart = Date.now()

    let beneBook = await coinbene.getOrderbook(symbol.toLowerCase(), depth)
        .then((x) => { return JSON.parse(x) })
        .catch((err) => {
            console.log(err);
            sendToTelegram("Coinbene", err)
            let logger = log4js.getLogger('errors');
            logger.error("CoinBene_getOrderBook: " + err);

        })

    let binaceBook = await binance.book({ symbol: symbol, limit: depth })
        .catch((err) => {
            console.log(err);
            sendToTelegram("Binance", err)
            let logger = log4js.getLogger('errors');
            logger.error("Binance_getOrderBook: " + err);
        })

    if (beneBook !== undefined && binaceBook !== undefined) {
        formula(beneBook, binaceBook)
    } else {
        setTimeout(async () => {
            await main()
        }, 1000)
    }

}


function formula(beneBook, binaceBook) {

    let beneAsk = beneBook.orderbook.asks[0].price;
    let beneBid = beneBook.orderbook.bids[0].price;
    let binanceAsk = Number(binaceBook.asks[0].price);
    let binanceBid = Number(binaceBook.bids[0].price);    

    let beneAskVolume = beneBook.orderbook.asks[0].quantity;
    let beneBidVolume = beneBook.orderbook.bids[0].quantity;
    let binanceAskVolume = Number(binaceBook.asks[0].quantity);
    let binanceBidBolume = Number(binaceBook.bids[0].quantity)

    if (beneAsk < binanceBid) {
        let persent = (binanceBid - beneAsk) * 100 / beneAsk;
        if (persent > persentGuard) {
            if (beneAskVolume >= minVolume && binanceBidBolume >= minVolume) {

                let volume = Math.min(beneAskVolume, binanceBidBolume);
                if(volume > maxVolume){
                    volume = maxVolume
                }
                
                buySell("buy", "sell", beneAsk, persent, volume);
            } else {
                main()
            }
        } else {
            main()
        }
    } else if (binanceAsk < beneBid) {
        let persent = (beneBid - binanceAsk) * 100 / binanceAsk;
        if (persent > persentGuard) {
            if (binanceAskVolume >= minVolume && beneBidVolume >= minVolume ) {

                let volume = Math.min(binanceAskVolume, beneBidVolume);
                if(volume > maxVolume){
                    volume = maxVolume
                }

                buySell("sell", "buy", beneBid , persent, volume);
            } else {
                main()
            }
        } else {
            main()
        }
    } else {
        main()
    }
}


async function buySell(typeA, typeB, priceA , persent, volume) {
    let config = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "type": typeA + "-limit",
        "price": priceA.toFixed(6),
        "quantity": String(volume),
        "symbol": symbol.toLowerCase()
    }
    let coinBene = await coinbene.postOrderPlace(config)
        .then((x) => { return JSON.parse(x) })
        .catch((err) => {
            console.log(err);
            sendToTelegram("Coinbene", err)
            let logger = log4js.getLogger('errors');
            logger.error("Coinbene-postOrderPlace: " + err);
        })

    let Binance = await binance.order({
        symbol: symbol,
        side: typeB.toUpperCase(),
        type: "MARKET",
        quantity: Number(volume),
        //  price: priceB.toFixed(6),
    }).catch((err) => {
        console.log(err);
        sendToTelegram("Binance", err)
        let logger = log4js.getLogger('errors');
        logger.error("Binance-order: " + err);
    })

    await getInfo(coinBene, Binance, persent, typeA)

}



async function getInfo(coinBene, binance ,persent, method) {
    let persentNew
    let configInfo = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "orderid": String(coinBene.orderid)
    }
    let info = await coinbene.postInfo(configInfo)
        .then((x) => { return JSON.parse(x) })
        .catch((err) => {
            if(err){
                sendToTelegram("Coinbene", err)
            }
            console.log(err);
            let logger = log4js.getLogger('errors');
            logger.error("Coinbene-postInfo: " + err);
        })

        if(info.order === null){
            persentNew = "null"
        }else{
            if(method === "buy"){
                persentNew = (Number(binance.fills[0].price) - Number(info.order.price)) * 100 / Number(info.order.price);
            }else{
                persentNew = (Number(info.order.price) - Number(binance.fills[0].price)) * 100 / Number(binance.fills[0].price);
            }
        }

        let beneType = info.order === null ? "null" : info.order.type;
        let beneVolume = info.order === null ? "null" : info.order.orderquantity;
        let benePrice = info.order === null ? "null" : info.order.price
    
        let infoLog = log4js.getLogger("info");
        infoLog.info("Coinbene, " + info.status +
            ", " + info.timestamp +
            ', ' + beneType +
            ", " + beneVolume +
            ', ' + benePrice +
            ", Binance, " + binance.status +
            ", " + binance.transactTime +
            ', ' + binance.side +
            ", " + binance.fills[0].qty +
            ', ' + binance.fills[0].price +
            ", " + persent.toFixed(5) +
            ", " + persentNew
        )
    
        sendToTelegram("transaction", 
        "Coinbene, " + info.status +
        ", " + info.timestamp +
        ', ' + beneType +
        ", " + beneVolume +
        ', ' + benePrice +
        ", Binance, " + binance.status +
        ", " + binance.transactTime +
        ', ' + binance.side +
        ", " + binance.fills[0].qty +
        ', ' + binance.fills[0].price +
        ", " + persent.toFixed(5) +
        ", " + persentNew
        )    


    await main();

}


function sendToTelegram(from, message){

    api.sendMessage({
        chat_id: "-1001381137228",
        text: from + message
    })
}