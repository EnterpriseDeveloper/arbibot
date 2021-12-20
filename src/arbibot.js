const log4js = require('log4js');
const telegram = require('telegram-bot-api');
const coinbene = require('./api/coinbene/api');
const Binance = require('binance-api-node').default
const _ = require('lodash');
const async = require("async");


const binance = Binance({
    apiKey: 'bYlub7u7TUYgg3i3yETaMYFE1WFKYvk2pecjOts39L0CraaONUHaV1zcASrqeISD',
    apiSecret: 'cI37M9Cgs7bcNz4yIaGvbXoPaEgqV4hV0EAjeamm7TJJLZDH5a1dGO6uXJsG8MlL',
    useServerTime: true
})

//Coinbene Keys
const CoinbeneApiid = "23e7f031b9baffd0d021ce8befaa19af";
const CoinbeneSecret = "501be7a95ddc46c4bb4894d8a5110f89";

// telegram

var api = new telegram({
    token: '714326199:AAGJ8bkWa51r19U-1P8GnA0SL9uOTh-p9RE'
});


// config panel
const depth = 10;
const symbol = "ETHBTC"; //format "ETHBTC"
const PER_min = 0.125;
const PER_max = 0.2;
const PER = 0.2;
const VOL = 0.1;

var buyId = null;
var sellId = null;
var postQuantity = 0;


; (async () => {
    console.log("work")

    log4js.configure({
        appenders: {
            multi: { type: 'multiFile', base: 'arbibot/', property: 'categoryName', extension: '.log' }

        },
        categories: {
            default: { appenders: ['multi'], level: 'info' }
        }
    })

    await main();

})()

async function main() {

    await async.parallel([
        async function (callback){
            let beneBook = await coinbene.getOrderbook(symbol.toLowerCase(), depth)
                .then((x) => { return JSON.parse(x) })
                .catch((err) => {
                    console.log(err);
                    // sendToTelegram("Coinbene", err)
                    let logger = log4js.getLogger('errors');
                    logger.error("CoinBene_getOrderBook: " + err);
                })
                if(beneBook !== undefined){
                    callback(null, beneBook);
                }

        },
        async function (callback) {
            let binaceBook = await binance.book({ symbol: symbol, limit: depth })
                .catch((err) => {
                    console.log(err);
                    // sendToTelegram("Binance", err)
                    let logger = log4js.getLogger('errors');
                    logger.error("Binance_getOrderBook: " + err);
                })
                if(binaceBook !== undefined){
                    callback(null, binaceBook);

                }
        }
    ],
        // optional callback
        function (err, results) {
            console.log(err);
            console.log(results);
        });

    // let a = Date.now()

    // let beneBook = await coinbene.getOrderbook(symbol.toLowerCase(), depth)
    //     .then((x) => { return JSON.parse(x) })
    //     .catch((err) => {
    //         console.log(err);
    //         // sendToTelegram("Coinbene", err)
    //         let logger = log4js.getLogger('errors');
    //         logger.error("CoinBene_getOrderBook: " + err);
    //     })

    // let binaceBook = await binance.book({ symbol: symbol, limit: depth })
    //     .catch((err) => {
    //         console.log(err);
    //         // sendToTelegram("Binance", err)
    //         let logger = log4js.getLogger('errors');
    //         logger.error("Binance_getOrderBook: " + err);
    //     })





    // if (beneBook !== undefined && binaceBook !== undefined) {
    //     let z = Date.now()
    //     console.log(z - a);
    //     main();
    //     //   letSell(beneBook, binaceBook);
    //     //    letBuy(beneBook, binaceBook);
    // } else {
    //     setTimeout(async () => {
    //         await main()
    //     }, 1000)
    // }

}


async function letBuy(beneBook, binaceBook) {
    let BeneB = beneBook.orderbook.bids[0].price;
    let BB = binaceBook.bids[0].price;
    let ProfitBuy = BB * (1 - PER / 100)
    let StopBuyMin = BB * (1 - PER_min / 100)
    // let StopBuyMax = BB * (1 - PER_max / 100)
    console.log(ProfitBuy);
    console.log(BeneB);

    if (buyId === null) {
        if (ProfitBuy > BeneB) {

            // set order to Conbene
            let postOrderCobinbene = await coinBenePostOrder("buy", ProfitBuy)
            console.log('order');

            // set to console order
            let persent = 100 * (BB - BeneB) / BeneB;
            let infoLog = log4js.getLogger("ordersBuy");
            infoLog.info("Buy, price: " + ProfitBuy + ", Coinbene price bit: " + BeneB + ", Binance price bit: " + BB + ', Persent: ' + persent)

            if (postOrderCobinbene.status === "ok") {

                buyId = postOrderCobinbene.orderid;

                letBuyOrder(BeneB, StopBuyMin, PER_max, BB)

            } else {
                main();
            }
        } else {
            main();
        }
    } else {
        letBuyOrder(BeneB, StopBuyMin, PER_max, BB)

    }
}


async function letBuyOrder(BeneB, StopBuyMin, PER_max, BB) {
    let info = await getInfoFromCoinbene(buyId)

    let StopBuyMax = 100 * (BeneB - info.order.price) / info.order.price

    if (info.order.orderstatus === "filled") {

        buyId = null;
        let binanceSell = await binancePostOrder("sell");

        let profit = 100 * (binanceSell.fills[0].price - info.order.price) / info.order.price;
        let infoLog = log4js.getLogger("info");
        infoLog.info("Buy Coinbene :" + info.order.price + " ; Sell Binance: " + binanceSell.fills[0].price + " ; Profit: " + profit);

        main();

    } else if (info.order.price > StopBuyMin || StopBuyMax > PER_max) {

        let cancelOrder = await cancelOrderCoinbene(buyId);

        let byMax = false;
        let byMin = false;
        if (info.order.price > StopBuyMin) {
            byMin = true;
        }
        if (StopBuyMax > PER_max) {
            byMax = true;
        }

        let persent = 100 * (BB - BeneB) / BeneB;

        let infoLog = log4js.getLogger("ordersBuy");
        infoLog.info(
            "Cancel, Coinbene price bit: " + BeneB +
            ", Binance price bit: " + BB +
            ', Persent: ' + persent +
            ", Order price: " + info.order.price +
            ', StopbyMin price:' + StopBuyMin +
            ', cancelByMin: ' + byMin +
            ', StopBuyMax persent: ' + StopBuyMax +
            ", PER_max: " + PER_max +
            ', cancelByMax: ' + byMax)

        console.log('cancel');

        if (cancelOrder.status === "ok") {
            buyId = null
            main();
        }
    } else {
        main();
    }
}




async function letSell(beneBook, binaceBook) {
    let asks = beneBook.orderbook.asks
    let BeneA = beneBook.orderbook.asks[0].price;
    let BA = Number(binaceBook.asks[0].price);

    let ProfitSell = BA * (1 + PER / 100)
    let StopSellMin = BA * (1 + PER_min / 100)


    if (sellId === null) {
        if (ProfitSell < BeneA) {

            // set order to Conbene
            let postOrderCobinbene = await coinBenePostOrder("sell", ProfitSell)
            console.log('order');
            postQuantity = postQuantity + 1;

            // set to console order
            let persent = 100 * (BeneA - BA) / BA;
            let infoLog = log4js.getLogger("ordersSell");
            infoLog.info("Buy, price: " + ProfitSell + ", Coinbene price bit: " + BeneA + ", Binance price bit: " + BA + ', Persent: ' + persent.toFixed(6))

            if (postOrderCobinbene.status === "ok") {

                sellId = postOrderCobinbene.orderid;
                main();

            } else {
                main();
            }
        } else {
            main();
        }
    } else {

        let info = await getInfoFromCoinbene(sellId);

        let priceInfo = parseFloat(info.order.price).toFixed(6);
        let beneBetterAsk = parseFloat(beneBook.orderbook.asks[0].price).toFixed(6)
        let profit = ProfitSell.toFixed(6);

        console.log(beneBetterAsk);
        console.log(priceInfo);
        console.log(profit)

        let StopBuyMax = 100 * (info.order.price - BeneA) / BeneA

        if (info.order.orderstatus === "filled") {

            sellId = null;
            let binanceBuy = await binancePostOrder("buy");
            console.log('binance buy');

            if (binanceBuy !== undefined) {

                postQuantity = postQuantity - 1;
                let persent = 100 * (info.order.price - binanceBuy.fills[0].price) / binanceBuy.fills[0].price;
                let infoLog = log4js.getLogger("info");
                infoLog.info("Sell Coinbene :" + info.order.price + " ; Buy Binance: " + binanceBuy.fills[0].price + " ; Profit: " + persent)

                main();
            } else {
                process.exit(1);
            }

        } else if (info.order.price < StopSellMin || StopBuyMax > PER_max) {


            let cancelOrder = await cancelOrderCoinbene(sellId);
            postQuantity = postQuantity - 1;


            let byMax = false;
            let byMin = false;
            if (info.order.price < StopSellMin) {
                byMin = true;
            }
            if (StopBuyMax > PER_max) {
                byMax = true;
            }

            let persent = 100 * (BA - BeneA) / BeneA;

            let infoLog = log4js.getLogger("ordersSell");
            infoLog.info(
                "Cancel, Coinbene price bit: " + BeneA +
                ", Binance price bit: " + BA +
                ', Persent: ' + persent +
                ", Order price: " + info.order.price +
                ', StopbyMin price:' + StopSellMin +
                ', cancelByMin: ' + byMin +
                ', StopBuyMax persent: ' + StopBuyMax +
                ", PER_max: " + PER_max +
                ', cancelByMax: ' + byMax)

            console.log('cancel');

            if (cancelOrder.status === "ok") {
                sellId = null
                main();
            }


        } else if (priceInfo > beneBetterAsk && priceInfo !== profit) {

            let getAllOrders = await openedOrders();

            let index = _.findIndex(getAllOrders.orders.result, function (o) {
                let price = parseFloat(o.price).toFixed(6);
                return price === profit;
            });
            if (index === -1) {
                let postOrderCobinbene = await coinBenePostOrder("sell", ProfitSell)
                console.log('order');

                postQuantity = postQuantity + 1;


                // set to console order
                let persent = 100 * (BeneA - BA) / BA;
                let infoLog = log4js.getLogger("ordersSell");
                infoLog.info(
                    "Buy, price: " + ProfitSell +
                    ", Coinbene price bit: " + BeneA +
                    ", Binance price bit: " + BA +
                    ', Persent: ' + persent.toFixed(6));

                if (postOrderCobinbene.status === "ok") {

                    sellId = postOrderCobinbene.orderid;
                    main();
                } else {
                    main();
                }
            } else {
                main()
            }

        } else {
            main();
        }

        cancelOrders(StopSellMin, PER_max, BeneA, BA);
        checkPos(asks);

    }
}

async function cancelOrders(StopSellMin, PER_max, BeneA, BA) {
    let orders = await openedOrders();
    if (orders.orders != null) {
        if (orders.orders.result.length >= 2) {

            for (let index = 0; index < orders.orders.result.length; index++) {

                let price = Number(orders.orders.result[index].price);
                let StopBuyMax = 100 * (price - BeneA) / BeneA;

                if (price < StopSellMin || StopBuyMax > PER_max) {

                    await cancelOrderCoinbene(orders.orders.result[index].orderid);
                    postQuantity = postQuantity - 1;


                    let byMax = false;
                    let byMin = false;
                    if (price < StopSellMin) {
                        byMin = true;
                    }
                    if (StopBuyMax > PER_max) {
                        byMax = true;
                    }

                    let persent = 100 * (BA - BeneA) / BeneA;

                    let infoLog = log4js.getLogger("ordersSell");
                    infoLog.info(
                        "Cancel, Coinbene price bit: " + BeneA +
                        ", Binance price bit: " + BA +
                        ', Persent: ' + persent +
                        ", Order price: " + price +
                        ', StopbyMin price:' + StopSellMin +
                        ', cancelByMin: ' + byMin +
                        ', StopBuyMax persent: ' + StopBuyMax +
                        ", PER_max: " + PER_max +
                        ', cancelByMax: ' + byMax)

                    console.log('cancel from cancellOrder');
                }
            }
            checkQuantityOfOrders(BeneA);
        }
    }
}

async function checkPos(asks) {
    let pricePos = []
    let orders = await openedOrders();
    if (orders.orders !== null) {
        if (orders.orders.result.length !== 0) {

            for (let index = 0; index < orders.orders.result.length; index++) {

                let price = Number(orders.orders.result[index].price);

                // find position;
                let position = _.findIndex(asks, function (o) {
                    return o.price === price
                });

                let priceAndPos = {
                    price: price,
                    index: position
                }

                pricePos.push(priceAndPos);
            }

            let info = log4js.getLogger("positionOfPriceAsks");
            info.info(pricePos);

        }
    }
}

async function checkQuantityOfOrders(bene) {
    let orders = await openedOrders();

    if (orders.orders !== null) {
        if (postQuantity > orders.orders.result.length) {
            let x = postQuantity - orders.orders.result.length
            console.log(x);

            for (let index = 0; index < x; index++) {
                let binanceBuy = await binancePostOrder("buy");
                if (binanceBuy !== undefined) {

                    postQuantity = postQuantity - 1;
                    let persent = 100 * (bene - binanceBuy.fills[0].price) / binanceBuy.fills[0].price;
                    let infoLog = log4js.getLogger("info");
                    infoLog.info("Sell from function checkQuantityOfOrders Coinbene :" + bene + " ; Buy Binance: " + binanceBuy.fills[0].price + " ; Profit: " + persent)
                    console.log("sell from checkQuantityOfOrders")
                } else {
                    process.exit(1);

                }
            }
        }
    };
}


//////////////////////////////////


async function coinBenePostOrder(act, price) {
    let config = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "type": act + "-limit",
        "price": price.toFixed(6),
        "quantity": String(VOL),
        "symbol": symbol.toLowerCase()
    }

    let coinBene = await coinbene.postOrderPlace(config)
        .then((x) => { return JSON.parse(x) })
        .catch((err) => {
            console.log(err);
            // sendToTelegram("Coinbene", err)
            let logger = log4js.getLogger('errors');
            logger.error("Coinbene-postOrderPlace: " + err);
        });
    return coinBene
}

async function binancePostOrder(act) {
    let Binance = await binance.order({
        symbol: symbol,
        side: act.toUpperCase(),
        type: "MARKET",
        quantity: Number(VOL),
    }).catch((err) => {
        console.log(err);
        //  sendToTelegram("Binance", err)
        let logger = log4js.getLogger('errors');
        logger.error("Binance-order: " + err);
    })
    return Binance
}

async function getInfoFromCoinbene(id) {
    let configInfo = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "orderid": String(id)
    }
    let info = await coinbene.postInfo(configInfo)
        .then((x) => { return JSON.parse(x) })
        .catch((err) => {
            // if (err) {
            //     sendToTelegram("Coinbene", err)
            // }
            console.log(err);
            let logger = log4js.getLogger('errors');
            logger.error("Coinbene-postInfo: " + err);
        })

    return info
}


async function cancelOrderCoinbene(id) {
    let configInfo = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "orderid": String(id)
    }
    let cancel = await coinbene.postCancel(configInfo)
        .then((x) => { return JSON.parse(x) })

    return cancel
}

async function openedOrders() {
    let config = {
        "apiid": CoinbeneApiid,
        "secret": CoinbeneSecret,
        "timestamp": new Date().getTime(),
        "symbol": symbol.toLowerCase()
    }

    let orders = await coinbene.postOpenOrders(config)
        .then((x) => { return JSON.parse(x) })
    return orders
}

// инициализация

// берем список отпрытих ордеов с кобинхуда... и добавляем в переменную количество

// вступление 

// берем цену с бинанса
// берем список отпрытих ордеов с кобинхуда... listOfOrders

// часть 0 заробатование денег
// берем quantity и сравниеваем с listOfOrders количество
// если оно не равно то продаем моментально на бинансе обьем одним ордером
// и quantity равно listOfOrders


// часть один 1 постановка ордера

// щитаем цену в profit и чекаем ести ли она в listOfOrders
// if(flase){

// ставим цену в оредер и доабвляем плюс один в переменную 

//}

// часто вторая 2 отмена ордеров
// прошли все ордера в списке listOfOrders и проверям их на min and max и убираем количество отмен с переменной quantity
// входим на вступление



