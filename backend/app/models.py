from enum import Enum
from dataclasses import dataclass, field
from typing import Optional


class StageStatus(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class PipelineJob:
    track_id: str
    stages: dict = field(default_factory=dict)
    current_stage: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "stages": self.stages,
            "current_stage": self.current_stage,
            "error": self.error,
        }
