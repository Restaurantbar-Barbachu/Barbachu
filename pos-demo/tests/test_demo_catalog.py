import json
import unittest
from pathlib import Path


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "demo-catalog.json"


class DemoCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    def test_every_identifier_is_synthetic(self):
        identifiers = [item["id"] for item in self.catalog["products"]]
        identifiers += [item["id"] for item in self.catalog["ingredients"]]
        self.assertTrue(identifiers)
        self.assertTrue(all(identifier.startswith("DEMO-") for identifier in identifiers))

    def test_every_display_name_is_labeled_as_demo(self):
        items = self.catalog["products"] + self.catalog["ingredients"]
        self.assertTrue(all("demo" in item["name"].casefold() for item in items))

    def test_prices_and_recipe_quantities_are_positive(self):
        self.assertTrue(all(item["priceCents"] > 0 for item in self.catalog["products"]))
        self.assertTrue(all(item["initialQuantity"] > 0 for item in self.catalog["ingredients"]))
        self.assertTrue(all(item["quantityPerUnit"] > 0 for item in self.catalog["recipes"]))

    def test_every_recipe_references_demo_catalog_items(self):
        product_ids = {item["id"] for item in self.catalog["products"]}
        ingredient_ids = {item["id"] for item in self.catalog["ingredients"]}
        self.assertTrue(self.catalog["recipes"])
        for recipe in self.catalog["recipes"]:
            self.assertIn(recipe["productId"], product_ids)
            self.assertIn(recipe["ingredientId"], ingredient_ids)


if __name__ == "__main__":
    unittest.main()
