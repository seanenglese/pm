from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str
    # Optional so boards saved before these fields existed still validate.
    priority: Literal["low", "medium", "high"] | None = None
    dueDate: date | None = None
    labels: list[Label] = Field(default_factory=list, max_length=10)


class Column(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_card_references(self) -> "BoardData":
        mismatched = [key for key, card in self.cards.items() if card.id != key]
        if mismatched:
            raise ValueError(f"cards keys do not match their card id: {sorted(mismatched)}")

        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("column ids must be unique")

        referenced_ids = [
            card_id for column in self.columns for card_id in column.cardIds
        ]
        if len(referenced_ids) != len(set(referenced_ids)):
            raise ValueError("a card id appears more than once across columns")

        missing = set(referenced_ids) - set(self.cards)
        if missing:
            raise ValueError(f"columns reference unknown card ids: {sorted(missing)}")
        return self
