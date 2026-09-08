'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  CloudUpload,
  ExternalLink,
  Globe2,
  GripVertical,
  Hotel,
  Image as ImageIcon,
  Images,
  Info,
  Orbit,
  Play,
  Plus,
  Shapes,
  Sparkles,
  Star,
  Trash2,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from 'lucide-react';

type MediaImage = {
  id: string;
  url: string;
  altText: string;
  category: 'ROOMS' | 'AMENITIES' | 'RESTAURANT' | 'EXTERIOR' | 'OTHERS';
  isMain: boolean;
  sortOrder: number;
  published: boolean;
};

type MediaVideo = {
  id: string;
  fileId: string;
  url: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  duration?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
};

type MediaFilter = 'All' | 'Rooms' | 'Amenities' | 'Restaurant' | 'Exterior' | 'Others';

const filters: { label: MediaFilter; icon: LucideIcon }[] = [
  { label: 'All', icon: Images },
  { label: 'Rooms', icon: BedDouble },
  { label: 'Amenities', icon: Sparkles },
  { label: 'Restaurant', icon: UtensilsCrossed },
  { label: 'Exterior', icon: Hotel },
  { label: 'Others', icon: Shapes },
];

function imageCategory(image: MediaImage): Exclude<MediaFilter, 'All'> {
  const stored = ({
    ROOMS: 'Rooms',
    AMENITIES: 'Amenities',
    RESTAURANT: 'Restaurant',
    EXTERIOR: 'Exterior',
  } as const)[image.category as Exclude<MediaImage['category'], 'OTHERS'>];
  if (stored) return stored;

  const text = image.altText.toLowerCase();
  if (/room|suite|bed|bath/.test(text)) return 'Rooms';
  if (/restaurant|dining|breakfast|coffee|food|bar/.test(text)) return 'Restaurant';
  if (/spa|pool|garden|gym|amenit|conference/.test(text)) return 'Amenities';
  if (/exterior|facade|entrance|hotel|view|^photo[-_]/.test(text)) return 'Exterior';
  return 'Others';
}

function categoryValue(filter: MediaFilter): MediaImage['category'] {
  return ({
    Rooms: 'ROOMS',
    Amenities: 'AMENITIES',
    Restaurant: 'RESTAURANT',
    Exterior: 'EXTERIOR',
    Others: 'OTHERS',
    All: 'OTHERS',
  } as const)[filter];
}

function formatBytes(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function HotelImagesMedia({
  hotelName,
  images,
  videos,
  virtualTourUrl: savedVirtualTourUrl,
  pendingImages,
  busy,
  onUpload,
  onDelete,
  onSetMain,
  onReorder,
  onUploadVideo,
  onDeleteVideo,
  onSaveVirtualTour,
  onBack,
  onContinue,
}: {
  hotelName: string;
  images: MediaImage[];
  videos: MediaVideo[];
  virtualTourUrl?: string | null;
  pendingImages: { name: string; url: string }[];
  busy: boolean;
  onUpload: (files: File[], category: MediaImage['category']) => void;
  onDelete: (image: MediaImage) => void;
  onSetMain: (image: MediaImage) => void;
  onReorder: (imageIds: string[]) => void;
  onUploadVideo: (file: File) => void;
  onDeleteVideo: (video: MediaVideo) => void;
  onSaveVirtualTour: (url: string) => Promise<boolean>;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [filter, setFilter] = useState<MediaFilter>('All');
  const [virtualTourUrl, setVirtualTourUrl] = useState(savedVirtualTourUrl ?? '');
  const [draggedImageId, setDraggedImageId] = useState('');

  useEffect(() => setVirtualTourUrl(savedVirtualTourUrl ?? ''), [savedVirtualTourUrl]);

  const orderedImages = useMemo(
    () => [...images].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder),
    [images],
  );
  const visibleImages = filter === 'All'
    ? orderedImages
    : orderedImages.filter((image) => imageCategory(image) === filter);
  const countFor = (label: MediaFilter) => label === 'All'
    ? images.length
    : images.filter((image) => imageCategory(image) === label).length;

  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length) onUpload(selected, categoryValue(filter));
  };

  const previewTour = async () => {
    const url = virtualTourUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    const previewWindow = window.open('about:blank', '_blank');
    if (await onSaveVirtualTour(url)) {
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.replace(url);
      }
    } else {
      previewWindow?.close();
    }
  };

  const reorderAt = (targetId: string) => {
    if (!draggedImageId || draggedImageId === targetId || filter !== 'All') return;
    const ids = orderedImages.map((image) => image.id);
    const from = ids.indexOf(draggedImageId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDraggedImageId('');
    onReorder(ids);
  };

  return (
    <section className="imagesMediaWorkspace">
      <section className="imagesMediaIntro">
        <div className="imagesMediaIntroText">
          <span className="imagesMediaTitleIcon"><ImageIcon /></span>
          <div>
            <h2>Images &amp; Media</h2>
            <p>Upload high quality images, videos and virtual tours to showcase your hotel. These will be used on the website, booking engine and partner channels.</p>
          </div>
        </div>
        <aside className="imagesGuidelines">
          <b><Info /> Guidelines</b>
          <ul>
            <li>Recommended image size: 1280 x 720 (16:9)</li>
            <li>Supported formats: JPG, JPEG, PNG, WebP</li>
            <li>Max file size: 5 MB per image</li>
            <li>Drag and drop to reorder images</li>
          </ul>
        </aside>
      </section>

      <div className="imagesMediaToolbar">
        <div className="mediaFilters">
          {filters.map((item) => {
            const FilterIcon = item.icon;
            return (
              <button
                type="button"
                className={filter === item.label ? 'active' : ''}
                aria-pressed={filter === item.label}
                key={item.label}
                onClick={() => setFilter(item.label)}
              >
                <FilterIcon /> {item.label} ({countFor(item.label)})
              </button>
            );
          })}
        </div>
        <div className="mediaUploadActions">
          <label>
            <Plus /> Upload Images
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ''; }} />
          </label>
          <label>
            <CloudUpload /> Bulk Upload
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ''; }} />
          </label>
        </div>
      </div>

      <div className="hotelMediaGrid">
        {visibleImages.map((image, index) => (
          <article
            className={`hotelMediaCard ${draggedImageId === image.id ? 'dragging' : ''}`}
            data-image-id={image.id}
            draggable={filter === 'All' && !busy}
            onDragStart={() => setDraggedImageId(image.id)}
            onDragEnd={() => setDraggedImageId('')}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => reorderAt(image.id)}
            key={image.id}
          >
            <div className="hotelMediaImage">
              <img src={image.url} alt={image.altText} />
              {image.isMain && <span className="mainPhotoBadge">Main Photo</span>}
              <button
                type="button"
                className={`mainPhotoStar ${image.isMain ? 'active' : ''}`}
                disabled={busy || image.isMain}
                title={image.isMain ? 'Main photo' : 'Set as main photo'}
                aria-label={image.isMain ? 'Main photo' : `Set ${image.altText} as main photo`}
                onClick={() => onSetMain(image)}
              >
                <Star fill={image.isMain ? 'currentColor' : 'none'} />
              </button>
              <div className="hotelMediaImageControls">
                <span title="Drag to reorder"><GripVertical /></span>
                <button type="button" disabled={busy} aria-label={`Delete ${image.altText}`} onClick={() => onDelete(image)}><Trash2 /></button>
              </div>
            </div>
            <p title={image.altText}>{image.altText || `${hotelName} image ${index + 1}`}</p>
          </article>
        ))}
        {filter === 'All' && pendingImages.filter((image) => image.url).map((image) => (
          <article className="hotelMediaCard pending" key={image.url}>
            <div className="hotelMediaImage">
              <img src={image.url} alt={image.name} />
              <span className="pendingMediaBadge">Uploading...</span>
            </div>
            <p>{image.name}</p>
          </article>
        ))}
        {filter === 'All' && (
          <label className="uploadMoreMedia">
            <span><Plus /></span>
            <b>{busy ? 'Uploading...' : 'Upload More'}</b>
            <small>JPG, PNG up to 5MB</small>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ''; }} />
          </label>
        )}
      </div>

      <div className="bottomMediaRow">
        <section className="mediaPanel videosPanel">
          <header>
            <div><span><Video /></span><div><h3>Videos</h3><p>Add hotel videos or walk-throughs (optional)</p></div></div>
            <label className="uploadVideoButton">
              <Plus /> {busy ? 'Uploading...' : 'Upload Video'}
              <input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadVideo(file); event.currentTarget.value = ''; }} />
            </label>
          </header>
          {videos.length ? videos.map((video) => (
            <div className="videoPreviewItem" data-video-id={video.id} key={video.id}>
              <div className="videoThumbnail">
                <video src={video.url} preload="metadata" poster={video.thumbnailUrl || orderedImages[0]?.url} />
                <span><Play fill="currentColor" /></span>
              </div>
              <div><h4>{video.title}</h4><p>{video.mimeType.replace('video/', '').toUpperCase()} · {formatBytes(video.size)}</p><small>Uploaded on {new Date(video.createdAt).toLocaleDateString()}</small></div>
              <button type="button" disabled={busy} aria-label={`Delete ${video.title}`} onClick={() => onDeleteVideo(video)}><Trash2 /></button>
            </div>
          )) : (
            <div className="videoPreviewItem empty">
              <div className="videoThumbnail">
                {orderedImages[0] ? <img src={orderedImages[0].url} alt="Hotel walkthrough thumbnail" /> : <ImageIcon />}
                <span><Play fill="currentColor" /></span>
              </div>
              <div><h4>Hotel Walkthrough</h4><p>No video uploaded</p><small>Add an MP4 or WebM walk-through</small></div>
            </div>
          )}
        </section>

        <section className="mediaPanel virtualTourPanel">
          <div className="virtualTourMain">
            <header><div><span><Orbit /></span><div><h3>Virtual Tour</h3><p>Add a 360° virtual tour link (optional)</p></div></div></header>
            <label>
              Virtual Tour URL
              <div><input type="url" value={virtualTourUrl} onChange={(event) => setVirtualTourUrl(event.target.value)} placeholder="https://" /><button type="button" disabled={!/^https?:\/\//i.test(virtualTourUrl.trim())} onClick={previewTour}><ExternalLink /> Preview</button></div>
            </label>
          </div>
          <small><Globe2 /> Supports Google Street View, Matterport or any 360° tour link</small>
        </section>
      </div>

      <div className="imagesMediaFooter">
        <button type="button" className="btn secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn" disabled={busy} onClick={async () => { if (await onSaveVirtualTour(virtualTourUrl.trim())) onContinue(); }}>Update &amp; Continue</button>
      </div>
    </section>
  );
}
