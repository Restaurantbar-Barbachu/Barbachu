import { MenuSectionData } from '../types';

export const RESTAURANT_MENU_SECTIONS: MenuSectionData[] = [
  {
    id: "espec",
    title: "Especialidades",
    part: "Especialidades",
    items: [
      {
        id: "esp-elote",
        name: "Elote Barbachu",
        price: "$85",
        group: "Especialidades",
        desc: "Pimienta · Búfalo · Aderezo Barbachu · BBQ",
        icon: "🌽",
      },
      {
        id: "esp-salchicha",
        name: "Salchicha Barbachu",
        price: "$70",
        group: "Especialidades",
        desc: "Salchicha frita · al estilo de la casa",
        icon: "🌭",
      },
      {
        id: "esp-alas",
        name: "Alas Barbachu",
        price: "$105",
        group: "Especialidades",
        sub: "Mamalonas $130",
        desc: "Picosas · 1/2 · Poco chile",
        icon: "🍗",
      },
      {
        id: "esp-boneles",
        name: "Boneles Barbachu",
        price: "$120",
        group: "Especialidades",
        sub: "Mamalonas $130",
        desc: "Picosas · 1/2 · Poco chile",
        icon: "🍗",
      },
      {
        id: "esp-camarones",
        name: "Camarones Barbachu",
        price: "$205",
        group: "Especialidades",
        desc: "Salsa especial · estilo Barbachu",
        icon: "🦐",
      },
    ],
  },
  {
    id: "sec-platillos",
    title: "Platillos",
    part: "Menú",
    items: [
      {
        id: "plat-camarones-gusto",
        name: "Camarones al gusto",
        price: "$205",
        group: "Platillos",
        sub: "Zarandeados · Diabla · Mantequilla · Ajillo",
      },
      {
        id: "plat-aguachile",
        name: "Aguachile",
        price: "$190",
        group: "Platillos",
        sub: "Verde · Rojo · Negro",
      },
      {
        id: "plat-camarones-cajun",
        name: "Camarones cajun",
        price: "$210",
        group: "Platillos",
      },
      {
        id: "plat-ribeye",
        name: "Rib Eye",
        price: "$320",
        group: "Platillos",
        sub: "Incluye ensalada y guarnición de papa.",
      },
      {
        id: "plat-newyork",
        name: "New York",
        price: "$290",
        group: "Platillos",
        sub: "Incluye ensalada y guarnición de papa.",
      },
      {
        id: "plat-pechuga",
        name: "Pechuga de Pollo",
        price: "$190",
        group: "Platillos",
        sub: "Incluye ensalada y guarnición de papa.",
      },
    ],
  },
  {
    id: "sec-hambur",
    title: "Hamburguesas C/Papas",
    items: [
      {
        id: "ham-res",
        name: "Res",
        price: "$95",
        group: "Hamburguesa C/Papas",
      },
      {
        id: "ham-pollo",
        name: "Pollo",
        price: "$120",
        group: "Hamburguesa C/Papas",
      },
    ],
  },
  {
    id: "sec-extras",
    title: "Extras",
    items: [
      { id: "ext-papa-dorada", name: "Papa Dorada", price: "$45", group: "Extras" },
      { id: "ext-papa-salchicha", name: "Papa C/Salchicha", price: "$85", group: "Extras" },
      { id: "ext-papa-gajo", name: "Papa Gajo", price: "$90", group: "Extras" },
      { id: "ext-papa-francesa", name: "Papa Francesa", price: "$90", group: "Extras" },
      { id: "ext-dedos-queso", name: "Dedos de Queso", price: "$105", group: "Extras" },
      { id: "ext-aros-cebolla", name: "Aros de Cebolla", price: "$90", group: "Extras" },
      { id: "ext-salchichas", name: "Salchichas", price: "$45", group: "Extras" },
    ],
  },
  {
    id: "sec-botana",
    title: "Botana",
    subcategories: [
      {
        caption: "Alas",
        items: [
          {
            id: "bot-alas",
            name: "Orden de Alas",
            price: "$95",
            group: "Botana · Alas",
            sub: "BBQ · Búfalo · Pimienta Limón · Parmesano · Spicy · Mango Habanero",
          },
        ],
      },
      {
        caption: "Botana Barbachu",
        description: "Papa dorada, salchicha, camarón, cecina, pepino",
        items: [
          { id: "bot-chica", name: "Chica", price: "$170", group: "Botana · Botana Barbachu" },
          { id: "bot-grande", name: "Grande", price: "$245", group: "Botana · Botana Barbachu" },
        ],
      },
    ],
    items: [],
  },
  {
    id: "sec-cecina",
    title: "Cecina",
    items: [
      { id: "cec-chica", name: "Chica (50g)", price: "$120", group: "Cecina" },
      { id: "cec-grande", name: "Grande (120g)", price: "$185", group: "Cecina" },
    ],
  },
  {
    id: "sec-mich",
    title: "Micheladas 1 Litro",
    part: "Bebidas",
    note: "Todas incluyen pepino",
    items: [
      { id: "mich-sencilla", name: "Sencilla", price: "$90", group: "Micheladas 1 Litro" },
      { id: "mich-salchicha", name: "C/Salchicha", price: "$110", group: "Micheladas 1 Litro" },
      { id: "mich-camaron", name: "C/Camarón", price: "$125", group: "Micheladas 1 Litro" },
      { id: "mich-cecina", name: "C/Cecina", price: "$125", group: "Micheladas 1 Litro" },
      { id: "mich-barbachu", name: "Barbachu", price: "$145", group: "Micheladas 1 Litro" },
    ],
  },
  {
    id: "sec-cerveza",
    title: "Cervezas",
    subcategories: [
      {
        caption: "Cerveza Nacional 355ml",
        items: [
          { id: "cerv-corona-extra", name: "Corona Extra", price: "$30", group: "Cerveza Nacional 355ml" },
          { id: "cerv-corona-ambar", name: "Corona Ambar", price: "$30", group: "Cerveza Nacional 355ml" },
          { id: "cerv-victoria", name: "Victoria", price: "$30", group: "Cerveza Nacional 355ml" },
          { id: "cerv-estrella", name: "Estrella", price: "$35", group: "Cerveza Nacional 355ml" },
          { id: "cerv-pacifico", name: "Pacífico", price: "$35", group: "Cerveza Nacional 355ml" },
          { id: "cerv-modelo-esp", name: "Modelo Especial", price: "$35", group: "Cerveza Nacional 355ml" },
          { id: "cerv-modelo-negra", name: "Modelo Negra", price: "$35", group: "Cerveza Nacional 355ml" },
        ],
      },
      {
        caption: "Cerveza Nacional 210ml",
        items: [
          { id: "cerv-coronita-extra", name: "Coronita Extra", price: "$23", group: "Cerveza Nacional 210ml" },
          { id: "cerv-coronita-ambar", name: "Coronita Ambar", price: "$23", group: "Cerveza Nacional 210ml" },
        ],
      },
      {
        caption: "Mega 1.2L",
        items: [
          { id: "cerv-mega-clara", name: "Clara", price: "$95", group: "Mega 1.2L" },
          { id: "cerv-mega-ambar", name: "Ámbar", price: "$95", group: "Mega 1.2L" },
        ],
      },
      {
        caption: "Cubetas · 10 piezas",
        items: [
          { id: "cerv-cubeta-355", name: "355ml", price: "$300", group: "Cubetas · 10 piezas" },
          { id: "cerv-cubeta-210", name: "210ml", price: "$230", group: "Cubetas · 10 piezas" },
        ],
      },
      {
        caption: "Preparados (no cerveza)",
        items: [
          { id: "prep-rusa-cerveza", name: "Rusa de Cerveza 1lt", price: "$90", group: "Preparados (no cerveza)" },
          { id: "prep-lim-vodka", name: "Limonada Frutos Rojos", price: "$145", group: "Preparados (no cerveza)", sub: "Bebida preparada con Vodka" },
          { id: "prep-new-mix", name: "New Mix 355ml", price: "$45", group: "Preparados (no cerveza)" },
          { id: "prep-jack", name: "Jack Daniel's 355ml", price: "$65", group: "Preparados (no cerveza)" },
        ],
      },
    ],
    items: [],
  },
  {
    id: "sec-na",
    title: "Sin alcohol",
    subcategories: [
      {
        caption: "Bebidas S/Alcohol",
        items: [
          { id: "na-rusa", name: "Rusa de Refresco", price: "$90", group: "Bebidas S/Alcohol", sub: "Squirt · Agua mineral" },
          { id: "na-pepsi", name: "Refresco Pepsico 355ml", price: "$30", group: "Bebidas S/Alcohol" },
          { id: "na-boing", name: "Jugo Boing 355ml", price: "$30", group: "Bebidas S/Alcohol" },
          { id: "na-agua", name: "Botella de Agua", price: "$20", group: "Bebidas S/Alcohol" },
          { id: "na-limonada", name: "Limonada", price: "$90", group: "Bebidas S/Alcohol" },
          { id: "na-lim-frutos", name: "Limonada Frutos Rojos", price: "$95", group: "Bebidas S/Alcohol" },
          { id: "na-corona-cero", name: "Corona Cero", price: "$35", group: "Bebidas S/Alcohol" },
        ],
      },
      {
        caption: "Preparado de Clamato",
        items: [
          { id: "na-clamato-chico", name: "Chico", price: "$40", group: "Preparado de Clamato" },
          { id: "na-clamato-grande", name: "Grande", price: "$80", group: "Preparado de Clamato" },
        ],
      },
    ],
    items: [],
  },
];
