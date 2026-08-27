import React, { useState, useRef, useCallback } from 'react';
import ExifReader from 'exifreader';

const API_BASE = 'http://localhost:3001';

/**
 * Upload modal for adding new 360° panorama images.
 * Supports drag-and-drop, file selection, GPS coordinate input,
 * and auto-detects coordinates from EXIF data when available.
 */
export default function UploadModal({ isOpen, onClose, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [formData, setFormData] = useState({
    lat: '',
    lng: '',
    heading: '0',
    label: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback((newFiles) => {
    const imageFiles = Array.from(newFiles).filter((f) =>
      f.type.startsWith('image/')
    );

    setFiles((prev) => [...prev, ...imageFiles]);

    // Generate previews
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews((prev) => [
          ...prev,
          { name: file.name, url: e.target.result },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Try to extract EXIF GPS from first file
    if (imageFiles.length > 0) {
      extractExifGps(imageFiles[0]);
    }
  }, []);

  /**
   * Attempt to extract GPS coordinates from EXIF data.
   */
  const extractExifGps = async (file) => {
    try {
      const tags = await ExifReader.load(file);
      
      let lat = '';
      let lng = '';
      let heading = '0';

      if (tags['GPSLatitude'] && tags['GPSLongitude']) {
        lat = tags['GPSLatitude'].description;
        lng = tags['GPSLongitude'].description;
      }

      if (tags['GPSImgDirection']) {
        heading = tags['GPSImgDirection'].description;
      }

      if (lat && lng) {
        setFormData((prev) => ({
          ...prev,
          lat: parseFloat(lat).toFixed(6),
          lng: parseFloat(lng).toFixed(6),
          heading: heading ? parseFloat(heading).toFixed(0) : '0',
        }));
      }
    } catch (err) {
      console.warn('Could not read EXIF data:', err);
    }
  };

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const removeFile = useCallback((index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    if (!formData.lat || !formData.lng) {
      alert('Please enter GPS coordinates (latitude and longitude).');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      const totalFiles = files.length;
      let completed = 0;

      for (const file of files) {
        const data = new FormData();
        data.append('panorama', file);
        data.append('lat', formData.lat);
        data.append('lng', formData.lng);
        data.append('heading', formData.heading || '0');
        data.append('label', formData.label || '');

        const response = await fetch(`${API_BASE}/api/panoramas`, {
          method: 'POST',
          body: data,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
      }

      setUploadResult({
        success: true,
        message: `Successfully uploaded ${totalFiles} panorama${totalFiles > 1 ? 's' : ''}!`,
      });

      // Reset form
      setTimeout(() => {
        setFiles([]);
        setPreviews([]);
        setFormData({ lat: '', lng: '', heading: '0', label: '' });
        setUploadProgress(0);
        setUploadResult(null);
        onUploadComplete?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setUploadResult({
        success: false,
        message: `Upload failed: ${err.message}`,
      });
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="upload-modal glass-panel">
        <h2>📷 Upload 360° Panorama</h2>
        <p className="subtitle">
          Add equirectangular 360° images with GPS coordinates
        </p>

        {/* Drop Zone */}
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="drop-icon">🌐</div>
          <p className="drop-text">
            <strong>Click to browse</strong> or drag & drop your 360° images here
          </p>
          <p className="drop-text" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
            Supports JPG, PNG • Equirectangular 2:1 format
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Preview strip */}
        {previews.length > 0 && (
          <div className="upload-preview">
            {previews.map((preview, index) => (
              <div key={index} className="upload-preview-item">
                <img src={preview.url} alt={preview.name} />
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* GPS Coordinates */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="upload-lat">Latitude</label>
            <input
              id="upload-lat"
              className="form-input"
              type="number"
              step="any"
              name="lat"
              value={formData.lat}
              onChange={handleInputChange}
              placeholder="e.g. 14.5995"
            />
          </div>
          <div className="form-group">
            <label htmlFor="upload-lng">Longitude</label>
            <input
              id="upload-lng"
              className="form-input"
              type="number"
              step="any"
              name="lng"
              value={formData.lng}
              onChange={handleInputChange}
              placeholder="e.g. 120.9842"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="upload-heading">Heading (°)</label>
            <input
              id="upload-heading"
              className="form-input"
              type="number"
              name="heading"
              value={formData.heading}
              onChange={handleInputChange}
              placeholder="0-360"
              min="0"
              max="360"
            />
          </div>
          <div className="form-group">
            <label htmlFor="upload-label">Label (optional)</label>
            <input
              id="upload-label"
              className="form-input"
              type="text"
              name="label"
              value={formData.label}
              onChange={handleInputChange}
              placeholder="e.g. Main Street"
            />
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="upload-progress">
            <div className="upload-progress-bar-track">
              <div
                className="upload-progress-bar-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="upload-progress-text">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
          </div>
        )}

        {/* Result message */}
        {uploadResult && (
          <p
            style={{
              marginTop: '12px',
              fontSize: '0.85rem',
              color: uploadResult.success
                ? 'var(--accent-success)'
                : 'var(--accent-warning)',
            }}
          >
            {uploadResult.success ? '✓' : '✕'} {uploadResult.message}
          </p>
        )}

        {/* Action buttons */}
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length || ''} Image${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
