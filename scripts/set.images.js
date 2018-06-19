import mongoose from 'mongoose';
import ms from '../server/services/ms';
import {UploadImagesService, UploadService} from '@services';
import {Product} from '../server/models';
import  fs from 'fs';

(async () => {
    let countResult = 0;
    const exit = () => {
        mongoose.disconnect();
    };
    const parentId = process.env.GOOGLE_DRIVE_IMAGES;


    async function get_products(offset, files) {
        try {
            const products = await Product.find();
            await findArticleGoogle(0, products, files);
        } catch (err) {
            console.log(err);
        }
    }

    async function findArticleGoogle(index, products, files){
        if(index === products.length) {
            return products;
        }
        console.log('index', index);

        //Clear ImagesStorage
        // products[index].imagesStorage = [];
        // await products[index].save();

        const article = products[index].article;
        if(article){
            await getChildParentId(0, products[index], files, article);
        }

        return findArticleGoogle(index+1, products, files);
    }


    async function getChildParentId(index, product, files, article){
        if(index === files.length) {
            return;
        }
        await checkMatchFolder(files[index], product, files, article);
        return getChildParentId(index+1, product, files, article)
    }

    async function checkMatchFolder (file, product, files, article) {
        return new Promise(async (resolve, reject) => {
            try {
                if(file.name === article){
                    const findChildGoogle = await UploadService.getChild(file.id);
                    const arr = await findChildGoogle.files.slice(0);

                    const files = [];
                    await Object.keys(arr).forEach(key => {
                        if (['image/png', 'image/jpeg'].indexOf(arr[key].mimeType) > -1) files.push(arr[key]);
                    });

                    const arrSort = await files.sort(sort);
                    await saveProductProccess(product, arrSort);
                    resolve(product);
                } else {
                    resolve(product);
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    async function saveProductProccess(product, arrSort) {
        return new Promise((resolve, reject) => {
            try {
                product.imagesStorage = arrSort;
                const saveProduct = product.save();
                resolve(saveProduct);
            } catch (err) {
                reject(err);
            }
        });
    }

    function sort(a,b) {
        var x = a.name.toLowerCase();
        var y = b.name.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
    }

    async function getFilesParentId(filesArr, pageToken) {
        try {
            const getFilesArr = await UploadService.getChild(parentId, pageToken);
            const filesInFolder = await saveFileToArray(0, getFilesArr.files, filesArr);
            if(getFilesArr.nextPageToken){
                await getFilesParentId(filesArr, getFilesArr.nextPageToken);
            }
            return filesInFolder;
        } catch (err) {
            console.log('err', err)
            throw(err);
        }
    }
    async function saveFileToArray(index, array, items) {
        if(index === array.length) {
            return items;
        }
        items.push(array[index]);
        return saveFileToArray(index + 1, array, items);
    }



    // todo run import products
    try {
        let filesArr = [];
        const files = await getFilesParentId(filesArr, null);
        await get_products(0, files);
        process.exit(0);
    } catch (e) {
        console.log(e);
        process.exit(0);
        exit();
    }
})();