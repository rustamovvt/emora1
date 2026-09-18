export const MEDIA_LIMITS = {
  STANDARD:{images:5,videos:1,voices:0,music:1},
  PRO_AI:{images:15,videos:3,voices:1,music:1},
  SIGNATURE:{images:30,videos:8,voices:3,music:1}
};

export function validateMediaUpload(project,{kind,role,size,mime}){
  const maxBytes = role==='music' ? 15*1024*1024 : role==='voice' ? 12*1024*1024 : kind==='video' ? 14*1024*1024 : 10*1024*1024;
  if(size>maxBytes) return `Fayl juda katta. Maksimum ${Math.round(maxBytes/1024/1024)}MB.`;
  if(role==='music' || role==='voice'){
    if(!['audio/mpeg','audio/mp4','audio/x-m4a','audio/m4a'].includes(mime)) return 'Audio faqat MP3 yoki M4A bo‘lishi kerak.';
  }
  const lim=MEDIA_LIMITS[project.plan]||MEDIA_LIMITS.STANDARD;
  const media=project.media||[];
  if(role==='music' && media.filter(x=>x.role==='music').length>=lim.music) return 'Fon musiqasi allaqachon yuklangan.';
  if(role==='voice' && media.filter(x=>x.role==='voice').length>=lim.voices) return 'Bu tarifda voice limitiga yetildi.';
  if(role==='content' && kind==='image' && media.filter(x=>x.role==='content'&&x.kind==='image').length>=lim.images) return `Bu tarifda maksimum ${lim.images} ta foto.`;
  if(role==='content' && kind==='video' && media.filter(x=>x.role==='content'&&x.kind==='video').length>=lim.videos) return `Bu tarifda maksimum ${lim.videos} ta video.`;
  return null;
}
