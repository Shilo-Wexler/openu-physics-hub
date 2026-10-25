"""The console's stats screen: one GET with everything the screen shows, for one period.

Every admin level may use it. The numbers come from services/stats.py.
"""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends

from app.routes.deps import Conn, require_admin
from app.services import stats

# The periods the console offers, in days. "all" has no start, so nothing to compare it with.
Period = Literal["7", "30", "all"]
PERIOD_DAYS: dict[str, int | None] = {"7": 7, "30": 30, "all": None}

router = APIRouter(prefix="/api/admin/stats", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("")
def get_stats(period: Period, conn: Conn):
    days = PERIOD_DAYS[period]
    span = timedelta(days=days) if days is not None else None
    return {
        "period": period,
        "inquiries": stats.inquiries(conn, span),
        "chat_courses": stats.chat_courses(days),
    }