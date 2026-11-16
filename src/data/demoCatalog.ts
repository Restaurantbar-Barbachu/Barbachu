import { Catalog } from '../types';

export const DEMO_CATALOG: Catalog = {
  products: [
    {
      id: "DEMO-PROD-01",
      name: "Tostada Demo",
      category: "Pruebas Demo",
      priceCents: 6500,
    },
    {
      id: "DEMO-PROD-02",
      name: "Agua Fresca Demo",
      category: "Pruebas Demo",
      priceCents: 2000,
    },
    {
      id: "DEMO-PROD-03",
      name: "Botana Demo",
      category: "Pruebas Demo",
      priceCents: 8500,
    },
    // Also include popular Barbachu specialties for expanded POS testing with recipes
    {
      id: "BB-ESP-01",
      name: "Elote Barbachu",
      category: "Especialidades",
      priceCents: 8500,
    },
    {
      id: "BB-ESP-02",
      name: "Salchicha Barbachu",
      category: "Especialidades",
      priceCents: 7000,
    },
    {
      id: "BB-ESP-03",
      name: "Alas Barbachu",
      category: "Especialidades",
      priceCents: 10500,
    },
    {
      id: "BB-ESP-04",
      name: "Camarones Barbachu",
      category: "Especialidades",
      priceCents: 20500,
    },
    {
      id: "BB-BEB-01",
      name: "Michelada Sencilla 1L",
      category: "Bebidas",
      priceCents: 9000,
    },
    {
      id: "BB-BEB-02",
      name: "Corona Extra 355ml",
      category: "Bebidas",
      priceCents: 3000,
    },
  ],
  ingredients: [
    {
      id: "DEMO-ING-01",
      name: "Maiz Demo",
      unit: "pieza",
      initialQuantity: 20,
    },
    {
      id: "DEMO-ING-02",
      name: "Queso Demo",
      unit: "g",
      initialQuantity: 800,
    },
    {
      id: "DEMO-ING-03",
      name: "Agua Demo",
      unit: "ml",
      initialQuantity: 6000,
    },
    {
      id: "DEMO-ING-04",
      name: "Limon Demo",
      unit: "ml",
      initialQuantity: 500,
    },
    {
      id: "ING-SALCH-01",
      name: "Salchicha Frita",
      unit: "pieza",
      initialQuantity: 50,
    },
    {
      id: "ING-ALAS-01",
      name: "Alitas de Pollo",
      unit: "g",
      initialQuantity: 3000,
    },
    {
      id: "ING-CAM-01",
      name: "Camarón Fresco",
      unit: "g",
      initialQuantity: 2500,
    },
    {
      id: "ING-CERV-01",
      name: "Cerveza Corona",
      unit: "botella",
      initialQuantity: 48,
    },
  ],
  recipes: [
    {
      productId: "DEMO-PROD-01",
      ingredientId: "DEMO-ING-01",
      quantityPerUnit: 1,
    },
    {
      productId: "DEMO-PROD-01",
      ingredientId: "DEMO-ING-02",
      quantityPerUnit: 30,
    },
    {
      productId: "DEMO-PROD-02",
      ingredientId: "DEMO-ING-03",
      quantityPerUnit: 250,
    },
    {
      productId: "DEMO-PROD-02",
      ingredientId: "DEMO-ING-04",
      quantityPerUnit: 15,
    },
    {
      productId: "DEMO-PROD-03",
      ingredientId: "DEMO-ING-01",
      quantityPerUnit: 2,
    },
    {
      productId: "DEMO-PROD-03",
      ingredientId: "DEMO-ING-02",
      quantityPerUnit: 40,
    },
    // Recipes for Barbachu specialties
    {
      productId: "BB-ESP-01",
      ingredientId: "DEMO-ING-01",
      quantityPerUnit: 1,
    },
    {
      productId: "BB-ESP-01",
      ingredientId: "DEMO-ING-02",
      quantityPerUnit: 20,
    },
    {
      productId: "BB-ESP-02",
      ingredientId: "ING-SALCH-01",
      quantityPerUnit: 3,
    },
    {
      productId: "BB-ESP-03",
      ingredientId: "ING-ALAS-01",
      quantityPerUnit: 350,
    },
    {
      productId: "BB-ESP-04",
      ingredientId: "ING-CAM-01",
      quantityPerUnit: 250,
    },
    {
      productId: "BB-BEB-01",
      ingredientId: "DEMO-ING-04",
      quantityPerUnit: 60,
    },
    {
      productId: "BB-BEB-02",
      ingredientId: "ING-CERV-01",
      quantityPerUnit: 1,
    },
  ],
};
