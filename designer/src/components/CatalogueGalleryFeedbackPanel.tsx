import { X } from 'lucide-react';

import { formatDateTime } from '../lib/catalogue-lightbox';
import type { CatalogueGalleryFeedbackState } from '../hooks/use-catalogue-gallery-feedback';
import { DotLoader } from './DotLoader';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';

interface CatalogueGalleryFeedbackPanelProps {
  canEdit: boolean;
  feedback: CatalogueGalleryFeedbackState;
  userEmail: string;
}

export function CatalogueGalleryFeedbackPanel({
  canEdit,
  feedback,
  userEmail,
}: CatalogueGalleryFeedbackPanelProps) {
  return (
    <IconTooltipProvider>
      <div className="catalogue-gallery-meta-head">
        <div className="catalogue-gallery-tabs" role="tablist" aria-label="Gallery details">
          <button
            type="button"
            role="tab"
            aria-selected={feedback.panel === 'comments'}
            className={`catalogue-gallery-tab ${feedback.panel === 'comments' ? 'is-active' : ''}`}
            onClick={() => feedback.setPanel('comments')}
          >
            Comments ({feedback.comments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={feedback.panel === 'annotations'}
            className={`catalogue-gallery-tab ${feedback.panel === 'annotations' ? 'is-active' : ''}`}
            onClick={() => feedback.setPanel('annotations')}
          >
            Annotations ({feedback.annotations.length})
          </button>
        </div>
      </div>

      {feedback.panel === 'comments' ? (
        <div className="catalogue-gallery-comments">
          <div className="catalogue-gallery-comments-list">
            {feedback.loadingComments ? (
              <div className="catalogue-gallery-comments-empty catalogue-gallery-comments-state">
                <DotLoader size="md" ariaLabel="Loading comments" />
                <span>Loading comments...</span>
              </div>
            ) : feedback.commentsError ? (
              <p className="catalogue-gallery-comments-empty catalogue-gallery-comments-state">
                {feedback.commentsError}
              </p>
            ) : feedback.comments.length === 0 ? (
              <p className="catalogue-gallery-comments-empty">No comments yet</p>
            ) : (
              feedback.comments.map((comment) => (
                <div key={comment.id} className="catalogue-gallery-comment">
                  <div className="catalogue-gallery-comment-top">
                    <span className="catalogue-gallery-comment-email">{comment.user_email}</span>
                    <span className="catalogue-gallery-comment-time">{formatDateTime(comment.created_at)}</span>
                    {canEdit && comment.user_email === userEmail && (
                      <IconTooltip label="Delete comment">
                        <button
                          type="button"
                          className="catalogue-gallery-comment-delete"
                          aria-label="Delete comment"
                          onClick={() => void feedback.deleteComment(comment.id)}
                        >
                          ×
                        </button>
                      </IconTooltip>
                    )}
                  </div>
                  <p className="catalogue-gallery-comment-text">{comment.text}</p>
                </div>
              ))
            )}
          </div>
          <div className="catalogue-gallery-comment-input">
            <input
              type="text"
              value={feedback.newComment}
              onChange={(event) => feedback.setNewComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void feedback.addComment();
                }
              }}
              placeholder={canEdit ? 'Add a comment...' : 'Enter email to comment'}
              disabled={!canEdit || feedback.savingComment}
            />
            <button
              type="button"
              onClick={() => void feedback.addComment()}
              disabled={!canEdit || !feedback.newComment.trim() || feedback.savingComment}
            >
              {feedback.savingComment ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        <div className="catalogue-gallery-annotations">
          <div className="catalogue-lightbox-annotation-toolbar">
            <button
              type="button"
              className={`catalogue-lightbox-annotation-toggle ${feedback.annotationMode ? 'is-active' : ''}`}
              onClick={feedback.toggleAnnotationMode}
            >
              {feedback.annotationMode ? 'Placement mode on' : 'Add pin'}
            </button>
            <span className="catalogue-lightbox-annotation-toolbar-copy">
              {feedback.annotationMode ? 'Click the image to place a pin.' : 'Select a pin to inspect it.'}
            </span>
          </div>
          {feedback.annotationError && <p className="catalogue-lightbox-annotation-error">{feedback.annotationError}</p>}
          {feedback.annotationDraft && (
            <div className="catalogue-lightbox-annotation-composer">
              <input
                type="text"
                value={feedback.annotationDraftText}
                onChange={(event) => feedback.setAnnotationDraftText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void feedback.addAnnotation();
                  }
                  if (event.key === 'Escape') {
                    feedback.cancelAnnotationDraft();
                  }
                }}
                placeholder={canEdit ? 'Write annotation text...' : 'Enter email to annotate'}
                disabled={!canEdit}
              />
              <div className="catalogue-lightbox-annotation-composer-actions">
                <button
                  type="button"
                  className="catalogue-lightbox-annotation-save"
                  onClick={() => void feedback.addAnnotation()}
                  disabled={!canEdit || !feedback.annotationDraftText.trim()}
                >
                  Save pin
                </button>
                <button
                  type="button"
                  className="catalogue-lightbox-annotation-cancel"
                  onClick={feedback.cancelAnnotationDraft}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="catalogue-lightbox-annotation-list">
            {feedback.annotations.length === 0 ? (
              <p className="catalogue-gallery-annotations-empty">No annotations yet</p>
            ) : (
              feedback.annotations.map((annotation, index) => (
                <div
                  key={annotation.id}
                  role="button"
                  tabIndex={0}
                  className={`catalogue-lightbox-annotation-item ${feedback.selectedAnnotationId === annotation.id ? 'is-active' : ''}`}
                  onClick={() => feedback.selectAnnotation(annotation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      feedback.selectAnnotation(annotation.id);
                    }
                  }}
                >
                  <div className="catalogue-lightbox-annotation-item-top">
                    <span className="catalogue-lightbox-annotation-badge">{index + 1}</span>
                    <span className="catalogue-lightbox-annotation-time">{formatDateTime(annotation.created_at)}</span>
                    {canEdit && annotation.user_email === userEmail && (
                      <IconTooltip label="Delete annotation">
                        <button
                          type="button"
                          className="catalogue-lightbox-annotation-delete"
                          aria-label="Delete annotation"
                          onClick={(event) => {
                            event.stopPropagation();
                            void feedback.deleteAnnotation(annotation.id);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </IconTooltip>
                    )}
                  </div>
                  <p className="catalogue-lightbox-annotation-text">{annotation.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </IconTooltipProvider>
  );
}
