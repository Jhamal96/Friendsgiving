// Small, raster-only captain portraits live inside the existing private draft
// and published team records. Avoid arbitrary image URLs or SVG/script payloads.
// The editor scales and compresses images before upload; this is the server bound.
export const MAX_CAPTAIN_PHOTO_LENGTH = 32000;
export function cleanCaptainPhoto(value){
 if(value===undefined||value===null||value==='')return '';
 if(typeof value!=='string'||value.length>MAX_CAPTAIN_PHOTO_LENGTH)return null;
 const match=/^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length%4!==0)return null;
 // Reject a GIF/SVG or unrelated payload merely relabeled as a raster image.
 if(match[1]==='webp'&&!match[2].startsWith('UklGR'))return null;
 if(match[1]==='jpeg'&&!match[2].startsWith('/9j/'))return null;
 return value;
}
