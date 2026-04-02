from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = (
        UniqueConstraint("shop_id", "item_id", name="uq_recipe_shop_item"),
    )

    recipe_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False, index=True)
    serving_size = Column(Integer, default=1)   # how many portions this recipe produces
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    item = relationship("Item", foreign_keys=[item_id])
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    recipe_id = Column(Integer, ForeignKey("recipes.recipe_id"), nullable=False, index=True)
    ingredient_item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    quantity = Column(Numeric(10, 3), nullable=False)
    unit = Column(String(20), nullable=True)          # kg, g, ml, L, pcs, tbsp
    cost_per_unit = Column(Numeric(10, 2), default=0) # purchase cost per unit

    recipe = relationship("Recipe", back_populates="ingredients")
    ingredient = relationship("Item", foreign_keys=[ingredient_item_id])
