const Product = Parse.Object.extend("product");
const Category = Parse.Object.extend("Category");


Parse.Cloud.define("create-product", async (request) => {
    if (request.user == null) throw "Usuário não autenticado";
    const stock = request.params.stock;
    if (stock == null || stock > 999) throw "Quantidade inválida";
    if (request.params.brandId == null) throw "Marca Inválida";

    const brand = new Brand();
    brand.id = request.params.brandId;

    const product = new Product();
    product.set("name", request.params.name);
    product.set("price", request.params.price);
    product.set("stock", request.params.stock);
    product.set("createdBy", request.user);
    product.set('brand', brand);
    product.set("isSeling0", false);
    const savedProduct = await product.save(null, { useMasterKey: true });
    return savedProduct.id;
});

//lista produtos 
Parse.Cloud.define('get-product-list', async (req) => {

    const queryProducts = new Parse.Query(Product);

    //condições da query

    if (req.params.name != null) {
        queryProducts.fullText('name', req.params.name);
        //queryProducts.matches('title', '.*' + req.params.title + '.*');
    }

    if (req.params.categoryId != null) {
        //filtrar por ponteiro 
        const category = new Category();
        category.id = req.params.categoryId;


        queryProducts.equalTo('category', category)
    }

    const itemsPerPage = req.params.itemsPerPage || 10;

    if (itemsPerPage > 100) throw "Quantidade inválida por página"

    queryProducts.skip(itemsPerPage * req.params.page || 0);

    queryProducts.limit(itemsPerPage);

    queryProducts.include('category');


    const resultProducts = await queryProducts.find({ useMasterKey: true });

    //o map mapeia minha lista de objetos
    return resultProducts.map(function (p) {
        p = p.toJSON();
        return formatProduct(p);
    });

});

//lista de categorias
Parse.Cloud.define('get-category-list', async (req) => {
    const queryCategories = new Parse.Query(Category);

    //condições

    const resultCategories = await queryCategories.find({ useMasterKey: true });
    return resultCategories.map(function (ca) {
        ca = ca.toJSON();
        return {
            title: ca.title,
            id: ca.objectId
        }
    });
});

function formatProduct(productJson) {
    return {

        id: productJson.objectId,
        title: productJson.title,
        description: productJson.description,
        price: productJson.price,
        unit: productJson.unit,
        picture: productJson.picture != null ? productJson.picture.url : null,

        category: {
            title: productJson.category.title,
            id: productJson.category.objectId
        },

    };
}
module.exports = { formatProduct }
