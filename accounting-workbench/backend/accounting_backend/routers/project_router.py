"""HTTP endpoints for project management."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from accounting_backend.config import API_PREFIX
from accounting_backend.schemas.project import (
    MergeRequest,
    MergeResponse,
    Project,
    ProjectCreateRequest,
    ProjectDetail,
    ProjectListResponse,
    SaveRequest,
)
from accounting_backend.services import project_service

router = APIRouter(prefix=API_PREFIX)


@router.post("/projects", response_model=ProjectDetail)
def create_project_endpoint(request: ProjectCreateRequest) -> ProjectDetail:
    """Import a file and create a new project."""
    return project_service.create_project(request)


@router.get("/projects", response_model=ProjectListResponse)
def list_projects_endpoint(
    name: Optional[str] = Query(None),
    creator: Optional[str] = Query(None),
    created_from: Optional[str] = Query(None),
    created_to: Optional[str] = Query(None),
    order_by: str = Query("last_opened_at"),
    offset: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=100),
) -> ProjectListResponse:
    """List projects with optional fuzzy / date-range filters and pagination."""
    return project_service.query_projects(
        name=name,
        creator=creator,
        created_from=created_from,
        created_to=created_to,
        order_by=order_by,
        offset=offset,
        limit=limit,
    )


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project_endpoint(project_id: str) -> ProjectDetail:
    """Return one project with its data and cached result."""
    return project_service.get_project(project_id)


@router.patch("/projects/{project_id}", response_model=Project)
def save_project_endpoint(project_id: str, request: SaveRequest) -> Project:
    """Save analysis config and result for a project."""
    return project_service.save_project(project_id, request)


@router.delete("/projects/{project_id}", response_model=dict)
def delete_project_endpoint(project_id: str) -> dict:
    """Delete a project and its cache directory."""
    project_service.delete_project(project_id)
    return {"success": True, "id": project_id}


@router.post("/projects/merge", response_model=MergeResponse)
def merge_projects_endpoint(request: MergeRequest) -> MergeResponse:
    """Merge multiple projects (dry_run returns preview only)."""
    return project_service.merge_projects(request)
