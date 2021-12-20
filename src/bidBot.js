const log4js = require("log4js");
const telegram = require("telegram-bot-api");
const coinbene = require("./api/coinbene/api");
const Binance = require("binance-api-node").default;
const _ = require("lodash");

const binance = Binance({
  apiKey: "bYlub7u7TUYgg3i3yETaMYFE1WFKYvk2pecjOts39L0CraaONUHaV1zcASrqeISD",
  apiSecret: "cI37M9Cgs7bcNz4yIaGvbXoPaEgqV4hV0EAjeamm7TJJLZDH5a1dGO6uXJsG8MlL",
  useServerTime: true
});

//Coinbene Keys
const CoinbeneApiid = "23e7f031b9baffd0d021ce8befaa19af";
const CoinbeneSecret = "501be7a95ddc46c4bb4894d8a5110f89";

// telegram

var api = new telegram({
  token: "714326199:AAGJ8bkWa51r19U-1P8GnA0SL9uOTh-p9RE"
});

// config panel
const depth = 10;
const from = "ETH";
const to = "BTC";
const PER_min = 0.125;
const PER_max = 0.2;
const PER = 0.15;
const VOL = 0.04;
const numberToFix = 6;

// not configurable !!!!!
var quantity = 0;
let oldAmount = null;
let symbol = from + to;

(async () => {
  log4js.configure({
    appenders: {
      multi: {
        type: "multiFile",
        base: "bidBot/",
        property: "categoryName",
        extension: ".log"
      }
    },
    categories: {
      default: { appenders: ["multi"], level: "info" }
    }
  });

  let getAllOrders = await openedOrders();
  if (getAllOrders.orders !== null) {
    let sell_list = getAllOrders.orders.result.filter(
      x => x.type === "buy-limit"
    );
    quantity = sell_list.length;
    await main();
  } else {
    quantity = 0;
    await main();
  }
})();

async function main() {
  let coinbeneBook = await coinbene
    .getOrderbook(symbol.toLowerCase(), depth)
    .then(x => {
      return JSON.parse(x);
    })
    .catch(err => {
      console.log(err);
      sendToTelegram("ERROR: BUY LIMIT. Details: Coinbene API " + err);
      let logger = log4js.getLogger("errors");
      logger.error("ERROR: BUY LIMIT. Details: Coinbene API " + err);
    });

  let binaceBook = await binance
    .book({ symbol: symbol, limit: depth })
    .catch(err => {
      console.log(err);
      sendToTelegram("ERROR: BUY LIMIT. Details: Binance API " + err);
      let logger = log4js.getLogger("errors");
      logger.error("ERROR: BUY LIMIT. Details: Binance API " + err);
    });

  let getAllOrders = await openedOrders();
  let listOfOrders;

  if (getAllOrders.orders !== null) {
    listOfOrders = getAllOrders.orders.result.filter(
      x => x.type === "buy-limit"
    );
  } else {
    listOfOrders = [];
  }

  if (coinbeneBook !== undefined && binaceBook !== undefined) {
    letEarn(coinbeneBook, binaceBook, listOfOrders);
  } else {
    setTimeout(async () => {
      await main();
    }, 1000);
  }
}

async function letEarn(coinbeneBook, binaceBook, listOfOrders) {
  if (quantity > listOfOrders.length) {
    let difference = quantity - listOfOrders.length;
    let volume = VOL * difference;

    let binanceSell = await binancePostOrder("sell", volume);
    if (binanceSell !== undefined) {
      // get balance
      let coinbeneBalance = await balance();
      let curOneCoinBene = _.find(coinbeneBalance.balance, { asset: from });
      let curTwoCoinBene = _.find(coinbeneBalance.balance, { asset: to });

      let binanceBalance = await binance.accountInfo();
      let curOneBinance = _.find(binanceBalance.balances, { asset: from });
      let curTwoBinance = _.find(binanceBalance.balances, { asset: to });
      console.log(curOneCoinBene, curTwoCoinBene, curOneBinance, curTwoBinance);

      let message =
        "SELL LIMIT. Vol: " + volume +
        ", Binance Buy: " + binanceBuy.fills[0].price + "%" +
        ", Limits: " + PER_min.toFixed(3) + "%, " +
        PER.toFixed(3) + "%, " +
        PER_max.toFixed(3) + "%" +
        ", Funds. " + from + ": " +
        (Number(curOneCoinBene.total) + Number(curOneBinance.free)).toFixed(2) +
        " (BB: " + parseFloat(curOneBinance.free).toFixed(2) +
        ", CB :" + parseFloat(curOneCoinBene.total).toFixed(2) +
        ") " + to + ": " +
        (Number(curTwoCoinBene.total) + Number(curTwoBinance.free)).toFixed(2) +
        " (BB: " + parseFloat(curTwoBinance.free).toFixed(2) +
        ", CB: " + parseFloat(curTwoCoinBene.total).toFixed(2) +" )";
        if(oldAmount !== null){
            let currencyOne = Number(curOneCoinBene.total) + Number(curOneBinance.free);
            let currencyTwo = Number(curTwoCoinBene.total) + Number(curTwoBinance.free);
            let oldCurrencyOne = oldAmount.CB_one + oldAmount.BB_one;
            let oldCurrencyTwo = oldAmount.CB_two + oldAmount.BB_two;
            let x = (currencyOne - oldCurrencyOne).toFixed(7);
            let y = (currencyTwo - oldCurrencyTwo).toFixed(7);
            let z = ".\n\r\Change. " + from + ":" + x +", " +to +": " + y;
            message = message + z;
        }

      let infoLog = log4js.getLogger("info");
      infoLog.info(message);

      sendToTelegram(message);

      quantity = listOfOrders.length;

      oldAmount = {
        CB_one: Number(curOneCoinBene.total),
        CB_two: Number(curTwoCoinBene.total),
        BB_one: Number(curOneBinance.free),
        BB_two: Number(curTwoBinance.free)
       }

      letBuy(coinbeneBook, binaceBook, listOfOrders);
    }
  } else {
    if (quantity < listOfOrders.length) {
      let info = log4js.getLogger("errors");
      info.info(
        "ERROR: BUY LIMIT. Details: quantity errors: " +
          quantity +
          ", listOfOrders: " +
          listOfOrders.length
      );

      sendToTelegram(
        "ERROR: BUY LIMIT. Details: quantity errors: " +
          quantity +
          ", listOfOrders: " +
          listOfOrders.length
      );
      quantity = listOfOrders.length;
    }

    letBuy(coinbeneBook, binaceBook, listOfOrders);
  }
}

async function letBuy(coinbeneBook, binaceBook, listOfOrders) {
  let CB = coinbeneBook.orderbook.bids[0].price;
  let BB = Number(binaceBook.bids[0].price);

  let profit = (BB * (1 - PER / 100)).toFixed(numberToFix);

  if (listOfOrders.length !== 0) {
    let find = listOfOrders.find(
      x => parseFloat(x.price).toFixed(numberToFix) === profit
    );
    if (find === undefined) {
      let postOrderCobinbene = await coinBenePostOrder("buy", profit);
      if (postOrderCobinbene.status === "ok") {
        quantity++;

        let infoLog = log4js.getLogger("orders");
        infoLog.info("Sell Coinbene, price: " + profit);

        letCancel(BB, CB, listOfOrders, coinbeneBook);
      } else {
        sendToTelegram(
          "STOP: BUY LIMIT. Details: Coinbene, " +
            postOrderCobinbene.description
        );
      }
    } else {
      letCancel(BB, CB, listOfOrders, coinbeneBook);
    }
  } else {
    let postOrderCobinbene = await coinBenePostOrder("buy", profit);

    if (postOrderCobinbene.status === "ok") {
      quantity++;

      let infoLog = log4js.getLogger("orders");
      infoLog.info("Sell Coinbene, price: " + profit);

      letCancel(BB, CB, listOfOrders, coinbeneBook);
    } else {
      sendToTelegram(
        "STOP: BUY LIMIT. Details: Coinbene, " + postOrderCobinbene.description
      );
    }
  }
}

async function letCancel(BB, CB, listOfOrders, coinbeneBook) {
  let index;
  let StopBuyMin = BB * (1 - PER_min / 100);

  for (index = 0; index < listOfOrders.length; index++) {
    let StopBuyMax =
      (100 * (CB - listOfOrders[index].price)) / listOfOrders[index].price;

    if (listOfOrders[index].price > StopBuyMin || StopBuyMax > PER_max) {
      let cancel = await cancelOrderCoinbene(listOfOrders[index].orderid);
      if (cancel.status === "ok") {
        quantity--;

        let infoLog = log4js.getLogger("orders");
        infoLog.info("Cancel Coinbene, price: " + listOfOrders[index].price);
      } else {
        let infoLog = log4js.getLogger("errors");
        infoLog.error("Cancel error: " + cancel.description);
        sendToTelegram(
          "ERROR: BUY LIMIT. Details: Cancel error, " + cancel.description
        );
      }
    }
  }

  if (index === listOfOrders.length) {
    main();
  }
}

//////////////////////////////////

async function coinBenePostOrder(act, price) {
  let config = {
    apiid: CoinbeneApiid,
    secret: CoinbeneSecret,
    timestamp: new Date().getTime(),
    type: act + "-limit",
    price: price,
    quantity: String(VOL),
    symbol: symbol.toLowerCase()
  };

  let coinBene = await coinbene
    .postOrderPlace(config)
    .then(x => {
      return JSON.parse(x);
    })
    .catch(err => {
      console.log(err);
      sendToTelegram("STOP: BUY LIMIT. Details: Coinbene post order, " + err);
      let logger = log4js.getLogger("errors");
      logger.error("Coinbene-postOrder: " + err);
    });
  return coinBene;
}

async function binancePostOrder(act, volume) {
  let Binance = await binance
    .order({
      symbol: symbol,
      side: act.toUpperCase(),
      type: "MARKET",
      quantity: Number(volume)
    })
    .catch(err => {
      console.log(err);
      sendToTelegram("STOP: BUY LIMIT. Details: Binance post order,  " + err);
      let logger = log4js.getLogger("errors");
      logger.error("Binance-order: " + err);
    });
  return Binance;
}

async function cancelOrderCoinbene(id) {
  let configInfo = {
    apiid: CoinbeneApiid,
    secret: CoinbeneSecret,
    timestamp: new Date().getTime(),
    orderid: String(id)
  };
  let cancel = await coinbene
    .postCancel(configInfo)
    .then(x => {
      return JSON.parse(x);
    })
    .catch(err => {
      console.log(err);

      sendToTelegram("ERROR: BUY LIMIT. Details: Cancel error, " + err);

      let logger = log4js.getLogger("errors");
      logger.error("Coinbene Cancel Order: " + err);
    });

  return cancel;
}

async function openedOrders() {
  let config = {
    apiid: CoinbeneApiid,
    secret: CoinbeneSecret,
    timestamp: new Date().getTime(),
    symbol: symbol.toLowerCase()
  };

  let orders = await coinbene
    .postOpenOrders(config)
    .then(x => {
      return JSON.parse(x);
    })
    .catch(err => {
      console.log(err);
      sendToTelegram("ERROR: BUY LIMIT. Details: Open orders error, " + err);

      let logger = log4js.getLogger("errors");
      logger.error("Coinbene Open Orders: " + err);
    });
  return orders;
}

function sendToTelegram(message) {
  api.sendMessage({
    chat_id: "-1001381137228",
    text: message
  });
}
