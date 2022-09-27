var Gerencianet = require('gn-api-sdk-node');

const OrderItem = Parse.Object.extend("OrderItem");
const Order = Parse.Object.extend("Order");
const CartItem = Parse.Object.extend("CartItem");
const GnEvent = Parse.Object.extend('GnEvent');

const product = require('./product');

var options = {
    sandbox: false,
    client_id: 'Client_Id_23980ceaca00338b54732de5d9dd5c984e077b08',
    client_secret: 'Client_Secret_99ef183a3b6ddf13b0cb148dd113080884a84513',
    pix_cert: __dirname + '/certs/producao-411223-bolosdavovo.p12',
};

var gerencianet = new Gerencianet(options);

Date.prototype.addSeconds = function (s) {
    this.setTime(this.getTime() + (s * 1000));
    return this;
}


//checkout
Parse.Cloud.define('checkout', async (req) => {
    if (req.user == null) throw "INVALID_USER";

    //buscou itens carrinho
    const queryCartItems = new Parse.Query(CartItem);
    queryCartItems.equalTo('user', req.user);
    queryCartItems.include('product');
    const resultCartItems = await queryCartItems.find({ useMasterKey: true });

    //calculou o seu total
    let total = 0;
    for (let item of resultCartItems) {
        item = item.toJSON();
        total += item.quantity * item.product.price;
    }
    //verificou se o tatal e valido
    if (req.params.total != total) throw "INVALID_TOTAL";

    const dueSeconds = 3600;
    const due = new Date().addSeconds(dueSeconds);

    //gerar pix e qr Code

    const charge = await createCharge(dueSeconds, req.user.get('cpf'), req.user.get('fullname'), total);
    const qrCodeData = await generateQrCode(charge.loc.id);

    //criar pedido
    const order = new Order();
    order.set('total', total);
    order.set('user', req.user);
    order.set('dueData', due);
    order.set('qrCodeImage', qrCodeData.imagemQrcode);
    order.set('qrCode', qrCodeData.qrcode);
    order.set('txid', charge.txid);
    order.set('status', 'pending_payment');
    const savedOrder = await order.save(null, { useMasterKey: true });

    //gerar uma nova ordem 
    for (let item of resultCartItems) {
        const orderItem = new OrderItem();
        orderItem.set('order', savedOrder);
        orderItem.set('user', req.user);
        orderItem.set('product', item.get('product'));
        orderItem.set('quantity', item.get('quantity'));
        orderItem.set('price', item.toJSON().product.price);
        await orderItem.save(null, { useMasterKey: true });

    }
    //zera o carrinho
    await Parse.Object.destroyAll(resultCartItems, { useMasterKey: true });

    return {
        id: savedOrder.id,
        total: total,
        qrCodeImage: qrCodeData.imagemQrcode,
        copiaecola: qrCodeData.qrcode,
        due: due.toISOString(),
        status: 'pending_payment',
    }

});

//buscar orders
Parse.Cloud.define('get-orders', async (req) => {
    if (req.user == null) throw "INVALID_USER";

    //trazer pedidos de um usuario especifico
    const queryOrders = new Parse.Query(Order);
    queryOrders.equalTo('user', req.user);
    const resultOrders = await queryOrders.find({ useMasterKey: true });
    return resultOrders.map(function (o) {
        o = o.toJSON();
        return {
            id: o.objectId,
            total: o.total,
            createdAt: o.createdAt,
            due: o.dueData.iso,
            qrCodeImage: o.qrCodeImage,
            copiaecola: o.qrcode,
            status: o.status,
        }
    });
});

Parse.Cloud.define('webhook', async (req) => {
    if (req.user == null) throw 'INVALID_USER';
    //if (req.user.id != "VJBMScRPMR") throw 'INVALID_USER';
    return "Olá mundo";
});

Parse.Cloud.define('config-webhook', async (req) => {

    let body = {

        "webhookUrl": "https://api.audiovisualfloripa.com/prod/webhook"
    }

    let params = {
        chave: "+5548988283942"
    }


    return await gerencianet.pixConfigWebhook(params, body);


});

Parse.Cloud.define('pix', async (req) => {
    for (const e of req.params.pix) {
        const gnEvent = new GnEvent();
        gnEvent.set('eid', e.endToEndId);
        gnEvent.set('txid', e.txid);
        gnEvent.set('event', e);
        await gnEvent.save(null, { useMasterKey: true });

        const query = new Parse.Query(Order);
        query.equalTo('txid', e.txid);

        const order = await query.first({ useMasterKey: true });
        if (order == null) {
            throw 'NOT_FOUND';
        }
        Order.set('status', 'paid');
        order.set('e2Id', e.endToEndId);

        await order.save(null, { useMasterKey: true });
    }
});

//buscar  item orders
Parse.Cloud.define('get-orders-items', async (req) => {
    if (req.user == null) throw "INVALID_USER";
    if (req.params.orderId == null) throw "INVALID_ORDER";

    const order = new Order();
    order.id = req.params.orderId;

    const queryOrderItems = new Parse.Query(OrderItem);
    queryOrderItems.equalTo('order', order);
    queryOrderItems.include('product');
    queryOrderItems.include('product.category');
    const resultOrderItems = await queryOrderItems.find({ useMasterKey: true });
    return resultOrderItems.map(function (o) {
        o = o.toJSON();
        return {
            id: o.objectId,
            quantity: o.quantity,
            price: o.price,
            product: product.formatProduct(o.product),
        }
    });
});


async function createCharge(dueSeconds, cpf, fullname, price) {

    let body = {
        "calendario": {
            "expiracao": dueSeconds
        },
        "devedor": {
            "cpf": cpf.replace(/\D/g, ''),
            "nome": fullname,
        },
        "valor": {
            "original": price.toFixed(2),
        },
        "chave": "+5548988283942", // Informe sua chave Pix cadastrada na Gerencianet

    }

    const response = await gerencianet.pixCreateImmediateCharge([], body);
    return response;

}

async function generateQrCode(locId) {
    let params = {
        id: locId
    }


    const response = await gerencianet.pixGenerateQRCode(params);
    return response;

}

