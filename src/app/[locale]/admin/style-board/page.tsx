'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

// Type definitions based on expected API response
interface Post {
  letter: string;
  uid: string;
}

interface StyleData {
  id: string;
  name: string;
  category: string;
  images: string[];
}

export default function StyleBoard() {
  const { user } = useAuth();
  const [postIdInput, setPostIdInput] = useState('');
  const [loadedPost, setLoadedPost] = useState<Post | null>(null);
  const [styles, setStyles] = useState<StyleData[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [generatingStyles, setGeneratingStyles] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async (postId: string) => {
    if (!user) return;
    setLoadingGrid(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/style-test?postId=${postId}`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setLoadedPost(data.post);
      setStyles(data.styles || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load data');
    } finally {
      setLoadingGrid(false);
    }
  }, [user]);

  const handleLoad = useCallback(() => {
    if (!postIdInput) return;
    loadData(postIdInput);
  }, [postIdInput, loadData]);

  const handleGenerate = useCallback(async (styleId: string) => {
    if (!postIdInput || !user) return;
    setGeneratingStyles(prev => ({ ...prev, [styleId]: true }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/style-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          postId: postIdInput,
          styleId
        })
      });
      if (!res.ok) throw new Error('Failed to generate');
      
      // Reload the data to get the newly generated images
      await loadData(postIdInput);
    } catch (err) {
      console.error(err);
      alert('Failed to generate images');
    } finally {
      setGeneratingStyles(prev => ({ ...prev, [styleId]: false }));
    }
  }, [postIdInput, user, loadData]);

  const getBadgeColor = (category: string) => {
    switch (category) {
      case 'photographer': return '#3b82f6'; // Blue
      case 'landscape': return '#10b981'; // Green
      case 'landscape-with-person': return '#8b5cf6'; // Purple
      default: return '#6b7280'; // Gray fallback
    }
  };

  return (
    <div style={{ backgroundColor: '#111', color: '#fff', minHeight: '100vh', padding: '40px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>Style Board</h1>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
          <input
            type="text"
            placeholder="Enter Post ID"
            value={postIdInput}
            onChange={(e) => setPostIdInput(e.target.value)}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #333',
              backgroundColor: '#222',
              color: '#fff',
              fontSize: '16px',
              width: '300px'
            }}
          />
          <button
            onClick={handleLoad}
            disabled={loadingGrid || !postIdInput}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: loadingGrid || !postIdInput ? '#333' : '#3b82f6',
              color: loadingGrid || !postIdInput ? '#888' : '#fff',
              cursor: loadingGrid || !postIdInput ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
              transition: 'background-color 0.2s'
            }}
          >
            {loadingGrid ? 'Loading...' : 'Load'}
          </button>
        </div>

        {loadedPost && (
          <div style={{ marginBottom: '32px', padding: '24px', backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#a3a3a3' }}>Post Letter:</h2>
            <p style={{ margin: 0, lineHeight: '1.6', fontSize: '16px', color: '#f5f5f5' }}>{loadedPost.letter}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {styles.map(style => (
            <div key={style.id} style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '24px', backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }}>
              <div style={{ width: '220px', flexShrink: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '18px', marginBottom: '12px' }}>{style.name}</div>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: getBadgeColor(style.category),
                  color: '#fff'
                }}>
                  {style.category}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', flexGrow: 1 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const imgUrl = style.images[i];
                  return (
                    <div key={i} style={{
                      width: '120px',
                      aspectRatio: '9/16',
                      backgroundColor: imgUrl ? 'transparent' : '#111',
                      border: imgUrl ? 'none' : '2px dashed #333',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={`${style.name} slot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#444', fontSize: '14px', fontWeight: '500' }}>{i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleGenerate(style.id)}
                disabled={generatingStyles[style.id]}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: generatingStyles[style.id] ? '#333' : '#10b981',
                  color: generatingStyles[style.id] ? '#888' : '#fff',
                  cursor: generatingStyles[style.id] ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  flexShrink: 0,
                  minWidth: '140px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {generatingStyles[style.id] && (
                  <svg style={{ animation: 'spin 1s linear infinite', width: '16px', height: '16px', color: '#888' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <style>{`
                  @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                `}</style>
                {generatingStyles[style.id] ? 'Generating...' : 'Generate'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
