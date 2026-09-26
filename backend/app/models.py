from pydantic import BaseModel, ConfigDict, model_validator


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    details: str


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
        card_ids = set(self.cards)
        referenced_ids = {
            card_id for column in self.columns for card_id in column.cardIds
        }
        missing = referenced_ids - card_ids
        if missing:
            raise ValueError(f"columns reference unknown card ids: {sorted(missing)}")
        return self
