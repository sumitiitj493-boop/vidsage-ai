from fastapi import APIRouter, HTTPException
from app.models.video_models import VideoRequest, VideoResponse
from app.services.video_downloader import VideoDownloaderService

router = APIRouter(prefix="/api/video", tags=["Video Operations"])


@router.post("/download", response_model=VideoResponse)
async def download_video(request: VideoRequest):

    try:
        service = VideoDownloaderService()

        result = await service.download_audio(
            url=request.video_url,
            output_format=request.output_format,
            quality=request.quality
        )

        return VideoResponse(
            success=True,
            message="Audio download successful!",
            **result
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))