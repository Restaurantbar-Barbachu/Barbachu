export interface SoftProduct {
  key: string;
  name: string;
  group: string;
  category: string;
  sourcePrice: number;
  priceCents: number;
  saleEnabled: boolean;
}

export interface SoftIngredient {
  Clave: number;
  Descripción: string;
  Unidad: string;
  Grupo: number;
  Costo: number;
  'Costo Promedio': number;
  Categoría: string;
  stock?: number;
}

export const SOFT_PRODUCTS: SoftProduct[] = [
  {
    "key": "729",
    "name": "ALAS CONVINADAS",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "707",
    "name": "BARBACHU",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 105,
    "priceCents": 10500,
    "saleEnabled": true
  },
  {
    "key": "701",
    "name": "BBQ",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "702",
    "name": "BUFALO",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "708",
    "name": "MANGO HABANERO",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "732",
    "name": "NATURALES",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "704",
    "name": "PARMESANO",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "703",
    "name": "PIMIENTA LIMON",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "705",
    "name": "SPREY CREAM",
    "group": "7",
    "category": "ALAS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "121",
    "name": "CARIBE VINO TINTO",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "132",
    "name": "CLERICOT",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 145,
    "priceCents": 14500,
    "saleEnabled": true
  },
  {
    "key": "116",
    "name": "JACK DANIEL 355 ML",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 65,
    "priceCents": 6500,
    "saleEnabled": true
  },
  {
    "key": "120",
    "name": "LIMONADA FRUTOS ROJOS C/ALCOHOL",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 145,
    "priceCents": 14500,
    "saleEnabled": true
  },
  {
    "key": "110",
    "name": "MOJITO",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 160,
    "priceCents": 16000,
    "saleEnabled": true
  },
  {
    "key": "115",
    "name": "NEWMIX 355 ML",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "118",
    "name": "PERLA NEGRA",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 145,
    "priceCents": 14500,
    "saleEnabled": true
  },
  {
    "key": "114",
    "name": "RUSA DE CERVEZA 1 LT",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "125",
    "name": "STRONG BOW",
    "group": "1",
    "category": "BEBIDAS C/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "313",
    "name": "7UP",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "305",
    "name": "AGUA ENBOTELLADA 500ML",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 20,
    "priceCents": 2000,
    "saleEnabled": true
  },
  {
    "key": "310",
    "name": "AGUA MINERAL CH",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "122",
    "name": "BOOST",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "129",
    "name": "COCA COLA",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "321",
    "name": "DEL VALLE 413ML",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "319",
    "name": "JARRITOS",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "320",
    "name": "JUGO BOING",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 25,
    "priceCents": 2500,
    "saleEnabled": true
  },
  {
    "key": "316",
    "name": "JUMEX DURAZNO",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "317",
    "name": "JUMEX MANGO",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "304",
    "name": "JUMEX MANZANA",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "119",
    "name": "LIMONADA",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 85,
    "priceCents": 8500,
    "saleEnabled": true
  },
  {
    "key": "303",
    "name": "LIMONADA FRUTOS ROJOS S/ALC",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "311",
    "name": "MANZANITA",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "318",
    "name": "MINERAL GRANDE",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 50,
    "priceCents": 5000,
    "saleEnabled": true
  },
  {
    "key": "312",
    "name": "MIRINDA",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "308",
    "name": "PEPSI",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "315",
    "name": "REDBULL",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "301",
    "name": "RUSA DE REFRESCO",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "306",
    "name": "RUSA MINERAL",
    "group": "3",
    "category": "BEBIDAS S/ALCOHOL",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "722",
    "name": "BONELES BARBACHU",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 130,
    "priceCents": 13000,
    "saleEnabled": true
  },
  {
    "key": "713",
    "name": "BONELES BBQ",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "123",
    "name": "BONELES BUFALO",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "731",
    "name": "BONELES CONVINADAS",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "124",
    "name": "BONELES MANGO HABANERO",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "730",
    "name": "BONELES NATURALES",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "721",
    "name": "BONELES PARMESANO",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "720",
    "name": "BONELES PIMIENTA LIMON",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "1309",
    "name": "BONELES SPACY CREAM",
    "group": "13",
    "category": "BONELES",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "715",
    "name": "AROS DE CEBOLLA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "709",
    "name": "BOTANA BAR CHICA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 170,
    "priceCents": 17000,
    "saleEnabled": true
  },
  {
    "key": "710",
    "name": "BOTANA BARB GRANDE",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 245,
    "priceCents": 24500,
    "saleEnabled": true
  },
  {
    "key": "711",
    "name": "CECINA CHICA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "712",
    "name": "CECINA GDE",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 185,
    "priceCents": 18500,
    "saleEnabled": true
  },
  {
    "key": "714",
    "name": "DEDOS DE QUESO",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 105,
    "priceCents": 10500,
    "saleEnabled": true
  },
  {
    "key": "1420",
    "name": "ELOTE BARBACHU",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 85,
    "priceCents": 8500,
    "saleEnabled": true
  },
  {
    "key": "716",
    "name": "FRANCESA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "1415",
    "name": "ORDEN PEPINO",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "725",
    "name": "ORDEN SALCHICHAS",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "724",
    "name": "PAPA C/SALCICHA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 85,
    "priceCents": 8500,
    "saleEnabled": true
  },
  {
    "key": "723",
    "name": "PAPA DORADA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 45,
    "priceCents": 4500,
    "saleEnabled": true
  },
  {
    "key": "717",
    "name": "PAPA GAJO",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "1414",
    "name": "PAPA/CAMARON",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 110,
    "priceCents": 11000,
    "saleEnabled": true
  },
  {
    "key": "734",
    "name": "PAPA/CECINA",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 115,
    "priceCents": 11500,
    "saleEnabled": true
  },
  {
    "key": "726",
    "name": "SALCHICHAS BARBACHU ORDEN",
    "group": "14",
    "category": "BOTANAS",
    "sourcePrice": 70,
    "priceCents": 7000,
    "saleEnabled": true
  },
  {
    "key": "508",
    "name": "AGUACHILE BARBACHU",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 190,
    "priceCents": 19000,
    "saleEnabled": true
  },
  {
    "key": "507",
    "name": "AGUACHILE NEGRO",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 185,
    "priceCents": 18500,
    "saleEnabled": true
  },
  {
    "key": "506",
    "name": "AGUACHILE ROJO",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 185,
    "priceCents": 18500,
    "saleEnabled": true
  },
  {
    "key": "505",
    "name": "AGUACHILE VERDE",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 185,
    "priceCents": 18500,
    "saleEnabled": true
  },
  {
    "key": "504",
    "name": "CAMARON AJILLO",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 205,
    "priceCents": 20500,
    "saleEnabled": true
  },
  {
    "key": "509",
    "name": "CAMARONES CAJUN",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 210,
    "priceCents": 21000,
    "saleEnabled": true
  },
  {
    "key": "502",
    "name": "CAMARONES DIABLA",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 205,
    "priceCents": 20500,
    "saleEnabled": true
  },
  {
    "key": "503",
    "name": "CAMARONES MANTEQUILLA",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 205,
    "priceCents": 20500,
    "saleEnabled": true
  },
  {
    "key": "511",
    "name": "PULPO",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 380,
    "priceCents": 38000,
    "saleEnabled": true
  },
  {
    "key": "117",
    "name": "ZARANDEADO",
    "group": "5",
    "category": "CAMARONES",
    "sourcePrice": 205,
    "priceCents": 20500,
    "saleEnabled": true
  },
  {
    "key": "108",
    "name": "AMPOLLETA CLARA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 23,
    "priceCents": 2300,
    "saleEnabled": true
  },
  {
    "key": "109",
    "name": "AMPOLLETA OSCURA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 23,
    "priceCents": 2300,
    "saleEnabled": true
  },
  {
    "key": "111",
    "name": "CAGUAMA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "1516",
    "name": "CORONA 0.0",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "102",
    "name": "CORONA CLARA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "1510",
    "name": "CORONA ESPECIAL",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1512",
    "name": "CORONA LIGHT",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "101",
    "name": "CORONA OSCURA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "309",
    "name": "HEINEKEN",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "105",
    "name": "LATA PACIFICO 355",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1517",
    "name": "MODELITO",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 25,
    "priceCents": 2500,
    "saleEnabled": true
  },
  {
    "key": "106",
    "name": "MODELO ESPECIAL",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1509",
    "name": "MODELO ESPECIAL LATA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "107",
    "name": "MODELO NEGRA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1514",
    "name": "PACIFICO",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1515",
    "name": "PACIFICO",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 28,
    "priceCents": 2800,
    "saleEnabled": true
  },
  {
    "key": "1513",
    "name": "VICTORIA",
    "group": "15",
    "category": "CERVEZA",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "510",
    "name": "ENSALADA DE POLLO",
    "group": "6",
    "category": "CORTES",
    "sourcePrice": 190,
    "priceCents": 19000,
    "saleEnabled": true
  },
  {
    "key": "602",
    "name": "NEW YORK",
    "group": "6",
    "category": "CORTES",
    "sourcePrice": 290,
    "priceCents": 29000,
    "saleEnabled": true
  },
  {
    "key": "604",
    "name": "PECHUGA DE POLLO",
    "group": "6",
    "category": "CORTES",
    "sourcePrice": 185,
    "priceCents": 18500,
    "saleEnabled": true
  },
  {
    "key": "603",
    "name": "RIB EYE",
    "group": "6",
    "category": "CORTES",
    "sourcePrice": 320,
    "priceCents": 32000,
    "saleEnabled": true
  },
  {
    "key": "113",
    "name": "AMPOLLETA 10PZAS 210 ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 230,
    "priceCents": 23000,
    "saleEnabled": true
  },
  {
    "key": "112",
    "name": "CUBETA 10 PZAS 355 ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 300,
    "priceCents": 30000,
    "saleEnabled": true
  },
  {
    "key": "130",
    "name": "CUBETA AMPOLLETA 5 PZ 210 ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 115,
    "priceCents": 11500,
    "saleEnabled": true
  },
  {
    "key": "131",
    "name": "CUBETA DE MEDIA 5 PZ 355 ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 150,
    "priceCents": 15000,
    "saleEnabled": true
  },
  {
    "key": "1606",
    "name": "MODELO",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 350,
    "priceCents": 35000,
    "saleEnabled": true
  },
  {
    "key": "1605",
    "name": "PACIFICO",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 350,
    "priceCents": 35000,
    "saleEnabled": true
  },
  {
    "key": "1607",
    "name": "PACIFICO AMPOLLETA 10 PZAS 210ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 280,
    "priceCents": 28000,
    "saleEnabled": true
  },
  {
    "key": "1608",
    "name": "PACIFICO AMPOLLETA 5 PZAS 210ML",
    "group": "16",
    "category": "CUBETAS",
    "sourcePrice": 140,
    "priceCents": 14000,
    "saleEnabled": true
  },
  {
    "key": "927",
    "name": "30-30",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1100,
    "priceCents": 110000,
    "saleEnabled": true
  },
  {
    "key": "910",
    "name": "BOTELLA CENTENARIO PLATA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 950,
    "priceCents": 95000,
    "saleEnabled": true
  },
  {
    "key": "902",
    "name": "BOTELLA HERADURA PLATA 1L",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1500,
    "priceCents": 150000,
    "saleEnabled": true
  },
  {
    "key": "922",
    "name": "BOTELLA HERADURA ULTRA 1L",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1350,
    "priceCents": 135000,
    "saleEnabled": true
  },
  {
    "key": "916",
    "name": "BOTELLA HERRADURA CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1300,
    "priceCents": 130000,
    "saleEnabled": true
  },
  {
    "key": "906",
    "name": "BOTELLA TRADICIONAL CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1100,
    "priceCents": 110000,
    "saleEnabled": true
  },
  {
    "key": "736",
    "name": "CAMPO AZUL SELECTO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 900,
    "priceCents": 90000,
    "saleEnabled": true
  },
  {
    "key": "923",
    "name": "DON JULIO CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "924",
    "name": "DON JULIO REPOSADO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "928",
    "name": "HERRADURA ULTRA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 260,
    "priceCents": 26000,
    "saleEnabled": true
  },
  {
    "key": "930",
    "name": "HERRADURA ULTRA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 130,
    "priceCents": 13000,
    "saleEnabled": true
  },
  {
    "key": "915",
    "name": "IMPORTE",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "917",
    "name": "MAESTRO DOBLE",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 160,
    "priceCents": 16000,
    "saleEnabled": true
  },
  {
    "key": "126",
    "name": "PALOMA CENTENARIO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 190,
    "priceCents": 19000,
    "saleEnabled": true
  },
  {
    "key": "127",
    "name": "PALOMA CENTENARIO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "926",
    "name": "PALOMA HERRADURA PLATA 1L",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 220,
    "priceCents": 22000,
    "saleEnabled": true
  },
  {
    "key": "728",
    "name": "SAN MATIAS CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 130,
    "priceCents": 13000,
    "saleEnabled": true
  },
  {
    "key": "914",
    "name": "SHOT CENTENARIO PLATA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 50,
    "priceCents": 5000,
    "saleEnabled": true
  },
  {
    "key": "918",
    "name": "SHOT CUMPLEAÑERO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "903",
    "name": "SHOT HERRADURA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "907",
    "name": "SHOT TRADICIONAL CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 80,
    "priceCents": 8000,
    "saleEnabled": true
  },
  {
    "key": "737",
    "name": "TEQUILA CASCAHUIN",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 1300,
    "priceCents": 130000,
    "saleEnabled": true
  },
  {
    "key": "921",
    "name": "VAMPIRO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 190,
    "priceCents": 19000,
    "saleEnabled": true
  },
  {
    "key": "912",
    "name": "VINO CENTENARIO PLATA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "911",
    "name": "VINO CENTENARIO PLATA 1L",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 190,
    "priceCents": 19000,
    "saleEnabled": true
  },
  {
    "key": "905",
    "name": "VINO HERRADURA PLATA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 220,
    "priceCents": 22000,
    "saleEnabled": true
  },
  {
    "key": "904",
    "name": "VINO HERRADURA PLATA 1/2",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 110,
    "priceCents": 11000,
    "saleEnabled": true
  },
  {
    "key": "908",
    "name": "VINO TRADICIONAL CRISTALINO",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 210,
    "priceCents": 21000,
    "saleEnabled": true
  },
  {
    "key": "909",
    "name": "VINO TRADICIONAL CRISTALINO 1/2",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 105,
    "priceCents": 10500,
    "saleEnabled": true
  },
  {
    "key": "929",
    "name": "VODKA",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 40,
    "priceCents": 4000,
    "saleEnabled": true
  },
  {
    "key": "925",
    "name": "VODKA TONIC",
    "group": "9",
    "category": "DESTILADOS",
    "sourcePrice": 150,
    "priceCents": 15000,
    "saleEnabled": true
  },
  {
    "key": "1007",
    "name": "CAJA CIGARROS",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 150,
    "priceCents": 15000,
    "saleEnabled": true
  },
  {
    "key": "1016",
    "name": "CARNE BURGER",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 30,
    "priceCents": 3000,
    "saleEnabled": true
  },
  {
    "key": "1006",
    "name": "CIGARRO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1005",
    "name": "DEEP BARBACHU",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1002",
    "name": "DEEP BBQ",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1003",
    "name": "DEEP BUFALO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1004",
    "name": "DEEP MANGO HABANERO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1014",
    "name": "DEEP PARMESANO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1008",
    "name": "DEEP RANCH",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1009",
    "name": "ENBASE",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "1013",
    "name": "FRASCO CHILE BARBACHU",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "719",
    "name": "HIELO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 50,
    "priceCents": 5000,
    "saleEnabled": true
  },
  {
    "key": "1010",
    "name": "PRESTAMO EFECTIVO",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1012",
    "name": "RECARGA CELULAR",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1001",
    "name": "SALCHICHA",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 5,
    "priceCents": 500,
    "saleEnabled": true
  },
  {
    "key": "1015",
    "name": "SALSA EXTRA",
    "group": "10",
    "category": "EXTRAS",
    "sourcePrice": 10,
    "priceCents": 1000,
    "saleEnabled": true
  },
  {
    "key": "808",
    "name": "BURGER CAMARON",
    "group": "8",
    "category": "HAMBURGUESA",
    "sourcePrice": 130,
    "priceCents": 13000,
    "saleEnabled": true
  },
  {
    "key": "802",
    "name": "BURGER PECHUGA POLLO",
    "group": "8",
    "category": "HAMBURGUESA",
    "sourcePrice": 105,
    "priceCents": 10500,
    "saleEnabled": true
  },
  {
    "key": "809",
    "name": "BURGER POLLO",
    "group": "8",
    "category": "HAMBURGUESA",
    "sourcePrice": 120,
    "priceCents": 12000,
    "saleEnabled": true
  },
  {
    "key": "801",
    "name": "RES",
    "group": "8",
    "category": "HAMBURGUESA",
    "sourcePrice": 95,
    "priceCents": 9500,
    "saleEnabled": true
  },
  {
    "key": "1701",
    "name": "MICHELADA",
    "group": "17",
    "category": "MICHELADA",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "225",
    "name": "MICHELADA BARBACHU",
    "group": "17",
    "category": "MICHELADA",
    "sourcePrice": 145,
    "priceCents": 14500,
    "saleEnabled": true
  },
  {
    "key": "231",
    "name": "MICHELADA S/ALCOHOL",
    "group": "17",
    "category": "MICHELADA",
    "sourcePrice": 90,
    "priceCents": 9000,
    "saleEnabled": true
  },
  {
    "key": "128",
    "name": "PREPARADO CLAMATO CH",
    "group": "17",
    "category": "MICHELADA",
    "sourcePrice": 40,
    "priceCents": 4000,
    "saleEnabled": true
  },
  {
    "key": "727",
    "name": "PREPARADO DE CLAMATO GRANDE",
    "group": "17",
    "category": "MICHELADA",
    "sourcePrice": 80,
    "priceCents": 8000,
    "saleEnabled": true
  },
  {
    "key": "1202",
    "name": "1/2",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1205",
    "name": "3/4",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1226",
    "name": "BARABCHU",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 55,
    "priceCents": 5500,
    "saleEnabled": true
  },
  {
    "key": "1201",
    "name": "BARBACHU MAMALONAS",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1215",
    "name": "BBQ",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1204",
    "name": "BIEN COCIDO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "735",
    "name": "BUFALO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1238",
    "name": "CAMARON",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "805",
    "name": "CAPSU",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1209",
    "name": "CEBOLLA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1240",
    "name": "CECINA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1418",
    "name": "CHAMOY",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1416",
    "name": "CHILE",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "232",
    "name": "CLAMATO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "718",
    "name": "CON TODO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1231",
    "name": "CREMA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1222",
    "name": "DORADA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 15,
    "priceCents": 1500,
    "saleEnabled": true
  },
  {
    "key": "1224",
    "name": "DORADA/CAMARON",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1225",
    "name": "DORADA/CECINA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 35,
    "priceCents": 3500,
    "saleEnabled": true
  },
  {
    "key": "1223",
    "name": "DORADA/SALCHICHA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 20,
    "priceCents": 2000,
    "saleEnabled": true
  },
  {
    "key": "512",
    "name": "DURAZNO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1241",
    "name": "ELOTE ADEREZO BARBACHU",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1207",
    "name": "ENSALADA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1206",
    "name": "GAJO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "804",
    "name": "JITOMATE",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1213",
    "name": "LECHUGA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1419",
    "name": "LIMON",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1217",
    "name": "MANGO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1228",
    "name": "MINERAL",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "920",
    "name": "MINERAL",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "919",
    "name": "MITAD COCA MITAD MINERAL",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "806",
    "name": "MOSTAZA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "733",
    "name": "PICOSAS",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1227",
    "name": "PINTADO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "233",
    "name": "PIÑA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1203",
    "name": "POCO CHILE",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "807",
    "name": "QUESO AMARILLO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1417",
    "name": "SAL",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1704",
    "name": "SENCILLA",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1239",
    "name": "TAJIN",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 0,
    "priceCents": 0,
    "saleEnabled": false
  },
  {
    "key": "1219",
    "name": "TAMARINDO",
    "group": "12",
    "category": "MODIFICADORES",
    "sourcePrice": 100,
    "priceCents": 10000,
    "saleEnabled": true
  }
];

export const SOFT_INGREDIENTS: SoftIngredient[] = [
  {
    "Clave": 213,
    "Descripción": "7UP",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 30,
    "Costo Promedio": 30,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 215,
    "Descripción": "AGUA ENBOTELLADA",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 210,
    "Descripción": "BOOST",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 214,
    "Descripción": "CARIBE",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 223,
    "Descripción": "DEL VALLE 413ML",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 710,
    "Descripción": "JACK DANIELS",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 204,
    "Descripción": "JUGO DURAZNO",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 202,
    "Descripción": "JUGO MANGO",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 203,
    "Descripción": "JUGO PIÑA",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 221,
    "Descripción": "JUMEX DURAZNO",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 212,
    "Descripción": "JUMEX MANGO",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 30,
    "Costo Promedio": 30,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 222,
    "Descripción": "JUMEX MANZANA",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 218,
    "Descripción": "MANZANITA",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 30,
    "Costo Promedio": 30,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 207,
    "Descripción": "MINERAL CH",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 206,
    "Descripción": "MINERAL GR",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 203.58,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 219,
    "Descripción": "MIRINDA",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 30,
    "Costo Promedio": 30,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 220,
    "Descripción": "NEW MIX",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 45,
    "Costo Promedio": 45,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 211,
    "Descripción": "PEPSI",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 208,
    "Descripción": "SQUIRT",
    "Unidad": "PZA",
    "Grupo": 2,
    "Costo": 28.8,
    "Costo Promedio": 0,
    "Categoría": "BEBIDAS"
  },
  {
    "Clave": 209,
    "Descripción": "CENTENARIO PLATA",
    "Unidad": "PZA",
    "Grupo": 9,
    "Costo": 950,
    "Costo Promedio": 95,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 906,
    "Descripción": "HERRADURA CRISTALINO",
    "Unidad": "PZA",
    "Grupo": 9,
    "Costo": 1300,
    "Costo Promedio": 1300,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 902,
    "Descripción": "HERRADURA PLATA",
    "Unidad": "PZA",
    "Grupo": 9,
    "Costo": 1500,
    "Costo Promedio": 1500,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 905,
    "Descripción": "HERRADURA ULTRA",
    "Unidad": "PZA",
    "Grupo": 9,
    "Costo": 1350,
    "Costo Promedio": 1350,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 904,
    "Descripción": "TRADICIONAL CRISTALINO",
    "Unidad": "OZ",
    "Grupo": 9,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 903,
    "Descripción": "VODKA",
    "Unidad": "OZ",
    "Grupo": 9,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "BOTELLAS"
  },
  {
    "Clave": 801,
    "Descripción": "CECINA",
    "Unidad": "PZA",
    "Grupo": 8,
    "Costo": 48.7,
    "Costo Promedio": 0,
    "Categoría": "CECINA"
  },
  {
    "Clave": 712,
    "Descripción": "CORONA CLARA 355ML",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 42.2,
    "Costo Promedio": 315.6945,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 703,
    "Descripción": "CORONA MEGA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 98.6301,
    "Costo Promedio": 335.0062,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 704,
    "Descripción": "CORONA OSCURA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 42.2,
    "Costo Promedio": 189.3585,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 702,
    "Descripción": "CORONITA CLARA 255ML",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 26.8065,
    "Costo Promedio": 161.4183,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 705,
    "Descripción": "CORONITA OSCURA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 41.5849,
    "Costo Promedio": 143.5364,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 711,
    "Descripción": "HEINEKEN",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 310,
    "Costo Promedio": 0,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 708,
    "Descripción": "MODELO ESP LATA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 12.3243,
    "Costo Promedio": 193.8533,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 707,
    "Descripción": "MODELO ESPECIAL",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 706,
    "Descripción": "MODELO NEGRA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 709,
    "Descripción": "PACIFICO LATA",
    "Unidad": "PZA",
    "Grupo": 7,
    "Costo": 46.6,
    "Costo Promedio": 39.2831,
    "Categoría": "CERVEZA"
  },
  {
    "Clave": 631,
    "Descripción": "ACEITE",
    "Unidad": "GALON",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 629,
    "Descripción": "ACEITE OLIVA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 626,
    "Descripción": "AJO EN POLVO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 627,
    "Descripción": "AJOS",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 115,
    "Descripción": "ALAS NUEVAS",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 613,
    "Descripción": "APIO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 601,
    "Descripción": "BBQ",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 621,
    "Descripción": "BUFALO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 632,
    "Descripción": "CAMARON SECO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 623,
    "Descripción": "CAPSU",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 610,
    "Descripción": "CEBOLLA",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 618,
    "Descripción": "CERRANO",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 637,
    "Descripción": "CHAMOY",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 642,
    "Descripción": "CHILE ARBOL",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 628,
    "Descripción": "CILANTRO",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 606,
    "Descripción": "CLAMATO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 638,
    "Descripción": "COSTA BRAVA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 620,
    "Descripción": "CREMA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 75,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 617,
    "Descripción": "HABANERO",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 640,
    "Descripción": "HOJA ALUMINIO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 636,
    "Descripción": "JARABE",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 609,
    "Descripción": "JITOMATE",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 604,
    "Descripción": "JUGO SAZONADOR",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 616,
    "Descripción": "LECHUGA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 615,
    "Descripción": "LIMON AMARILLO",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 614,
    "Descripción": "LIMON VERDE",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 201,
    "Descripción": "MAGGI",
    "Unidad": "LTS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 605,
    "Descripción": "MANGO HABANERO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 645,
    "Descripción": "MANTEQUILLA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 622,
    "Descripción": "MAYONESA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 607,
    "Descripción": "MOSTAZA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 639,
    "Descripción": "PALILLOS",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 634,
    "Descripción": "PAN HAMBURGUESA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 612,
    "Descripción": "PEPINO",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 625,
    "Descripción": "PIMIENTA LIMON",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 624,
    "Descripción": "PIMIENTA NEGRA",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 619,
    "Descripción": "QUESO AMERICANO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 172.95,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 602,
    "Descripción": "RANCH",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 641,
    "Descripción": "ROLLO ALUMINIO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 630,
    "Descripción": "SAL DE GRANO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 217,
    "Descripción": "SALCHICHA",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 162.66,
    "Costo Promedio": 165,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 608,
    "Descripción": "SOBRES CAPSU",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 205,
    "Descripción": "TAMARINDO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 635,
    "Descripción": "VINO TINTO",
    "Unidad": "PZA",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 611,
    "Descripción": "ZANAHORIA",
    "Unidad": "KGS",
    "Grupo": 6,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "INSUMOS COCINA"
  },
  {
    "Clave": 501,
    "Descripción": "PAPA DORADA",
    "Unidad": "PZA",
    "Grupo": 5,
    "Costo": 45,
    "Costo Promedio": 45,
    "Categoría": "PAPA DORADA"
  },
  {
    "Clave": 405,
    "Descripción": "BOLSA BASURA",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 407,
    "Descripción": "BOLSA BASURA BAÑO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 303,
    "Descripción": "BOLSA CAMISA CH",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 305,
    "Descripción": "BOLSA CAMISA GR",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 304,
    "Descripción": "BOLSA CAMISA M",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 313,
    "Descripción": "BOLSA PORCIONAR",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 302,
    "Descripción": "CONTEDOR CHICO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 301,
    "Descripción": "CONTENEDOR GRANDE 7X7",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 310,
    "Descripción": "POPOTES",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 308,
    "Descripción": "TAPA ADEREZO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 307,
    "Descripción": "TAPA VASO 1L",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 315,
    "Descripción": "VASO 14 OZ",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 309,
    "Descripción": "VASO ADEREZO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 306,
    "Descripción": "VASO LITRO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 314,
    "Descripción": "VASO ROJO",
    "Unidad": "PZA",
    "Grupo": 3,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PLASTICOS"
  },
  {
    "Clave": 216,
    "Descripción": "ALAS PORCIONADAS",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 105,
    "Descripción": "AROS CEBOLLA",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 102,
    "Descripción": "BONELES",
    "Unidad": "KGS",
    "Grupo": 1,
    "Costo": 148.33,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 107,
    "Descripción": "CAMARON AG/PL",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 106,
    "Descripción": "CAMARON CAJUN",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 112,
    "Descripción": "CARNE BURGER",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 101,
    "Descripción": "DEDOS",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 111,
    "Descripción": "ELOTE",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 104,
    "Descripción": "FRANCESA",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 110,
    "Descripción": "FRUTOS ROJOS",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 103,
    "Descripción": "GAJO",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 193.35,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 113,
    "Descripción": "HIELO",
    "Unidad": "KGS",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 109,
    "Descripción": "NEW YORK",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 114,
    "Descripción": "PECHUGA DE POLLO",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 148.33,
    "Costo Promedio": 148.33,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 108,
    "Descripción": "RIB EYE",
    "Unidad": "PZA",
    "Grupo": 1,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PORCIONES/CONGELADOS"
  },
  {
    "Clave": 402,
    "Descripción": "CLORO",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 408,
    "Descripción": "CLORO BAÑO",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 410,
    "Descripción": "DESENGRASANTE",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 401,
    "Descripción": "JABON TRASTES",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 411,
    "Descripción": "LIJAS",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 409,
    "Descripción": "LIQUIDO LIMPIADOR VIDRIO",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 404,
    "Descripción": "ROLLO BAÑO",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 403,
    "Descripción": "ROLLO COCINA",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  },
  {
    "Clave": 406,
    "Descripción": "SANITAS",
    "Unidad": "PZA",
    "Grupo": 4,
    "Costo": 0,
    "Costo Promedio": 0,
    "Categoría": "PRODUCTO HIGIENE"
  }
];
