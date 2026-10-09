// Keep thumbnail geometry independent of each card's text and image dimensions.
export const libraryListLayoutCss = String.raw`
.artifacts.list .card {
  grid-template-columns: 240px minmax(0, 1fr);
  column-gap: 24px;
  align-items: center;
  padding: 16px;
}
.artifacts.list .preview {
  width: 240px;
  height: 150px;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  aspect-ratio: auto;
  border-radius: 6px;
  align-self: center;
}
.artifacts.list .preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.artifacts.list .card-body {
  min-width: 0;
  padding: 8px 0;
}
.artifacts.list .placeholder { gap: 8px; }
.artifacts.list .placeholder strong { font-size: 32px; }
@media (max-width: 650px) {
  .artifacts.list .card {
    grid-template-columns: 110px minmax(0, 1fr);
    column-gap: 16px;
    padding: 12px;
  }
  .artifacts.list .preview { width: 110px; height: 68.75px; }
  .artifacts.list .card-body { padding: 0; }
  .artifacts.list .placeholder { gap: 4px; }
  .artifacts.list .placeholder strong { font-size: 20px; }
}
`;
