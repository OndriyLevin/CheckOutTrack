<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

const props = defineProps({
  user: Object
})

const activeTab = ref('queue') // 'queue' or 'playlists'
const tracks = ref([])
const playlists = ref([])
const loading = ref(true)

// Playlist Creation
const playlistForm = ref({ title: '', coverFile: null })
const showPlaylistModal = ref(false) // For creating new

// Playlist Details
const selectedPlaylist = ref(null) // Detailed view
const showPlaylistDetails = ref(false)

// Editing Tracks
const editingTrack = ref(null) 
const touchStartX = ref(0)
const swipedTrackId = ref(null)

// Yandex Export
const yandexToken = ref(localStorage.getItem('yandex_token') || '')
const exporting = ref(false)
const exportStatus = ref('')

const exportYandex = async () => {
    if (!yandexToken.value) return alert('Token required')
    localStorage.setItem('yandex_token', yandexToken.value)
    
    exporting.value = true
    exportStatus.value = 'Starting...'
    try {
        const res = await axios.post(`/api/admin/playlists/${selectedPlaylist.value.id}/export/yandex`, {}, {
            headers: { 
                'x-admin-id': props.user.id,
                'x-yandex-token': yandexToken.value
            }
        })
        exportStatus.value = `Success! Added: ${res.data.added}. Url updated.`
        if (res.data.serviceUrl) {
            selectedPlaylist.value.serviceUrl = res.data.serviceUrl
        }
        if (res.data.notFound?.length > 0) {
            alert('Not found tracks:\n' + res.data.notFound.join('\n'))
        }
    } catch(e) {
        console.error(e)
        exportStatus.value = `Error ${e.response?.status || ''}: ` + (e.response?.data?.error || e.message)
    }
    exporting.value = false
}

// Group tracks by User (Queue)
const groupedTracks = computed(() => {
  const groups = {}
  tracks.value.forEach(track => {
    const uid = track.userId
    if (!groups[uid]) {
      groups[uid] = { user: track.submittedBy, tracks: [] }
    }
    groups[uid].tracks.push(track)
  })
  return Object.values(groups)
})

// --- API ---

const fetchQueue = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/tracks', { headers: { 'x-admin-id': props.user.id } })
    tracks.value = res.data
  } catch (e) { console.error(e) }
  loading.value = false
}

const fetchPlaylists = async () => {
  loading.value = true
  try {
     const res = await axios.get('/api/admin/playlists', { headers: { 'x-admin-id': props.user.id } })
     playlists.value = res.data
  } catch (e) { console.error(e) }
  loading.value = false
}

const openPlaylistDetails = async (id) => {
    try {
        const res = await axios.get(`/api/admin/playlists/${id}`, { headers: { 'x-admin-id': props.user.id } })
        selectedPlaylist.value = res.data
        showPlaylistDetails.value = true
    } catch(e) { console.error(e) }
}

const savePlaylistLink = async () => {
    if (!selectedPlaylist.value) return
    try {
        await axios.put(`/api/admin/playlists/${selectedPlaylist.value.id}`, {
            serviceUrl: selectedPlaylist.value.serviceUrl
        }, { headers: { 'x-admin-id': props.user.id } })
        alert('Ссылка сохранена')
    } catch(e) { console.error(e); alert('Ошибка') }
}

// Track Logic (Swipe/Edit)
const onTouchStart = (e, id) => { touchStartX.value = e.touches[0].clientX }
const onTouchEnd = (e, id) => {
  const touchEndX = e.changedTouches[0].clientX
  if (touchStartX.value - touchEndX > 50) swipedTrackId.value = id
  else if (touchStartX.value - touchEndX < -50 && swipedTrackId.value === id) swipedTrackId.value = null
}

const startEdit = (track) => { editingTrack.value = { ...track }; swipedTrackId.value = null }
const saveEdit = async () => {
  if (!editingTrack.value) return
  try {
    await axios.put(`/api/admin/tracks/${editingTrack.value.id}`, editingTrack.value, { headers: { 'x-admin-id': props.user.id } })
    const idx = tracks.value.findIndex(t => t.id === editingTrack.value.id)
    if (idx !== -1) tracks.value[idx] = editingTrack.value
    editingTrack.value = null
  } catch (e) { console.error(e) }
}
const deleteTrack = async (id) => {
  if (!confirm('Удалить?')) return
  try {
    await axios.delete(`/api/admin/tracks/${id}`, { headers: { 'x-admin-id': props.user.id } })
    tracks.value = tracks.value.filter(t => t.id !== id)
  } catch (e) { console.error(e) }
}

// create playlist
const handleFileUpload = (e) => { playlistForm.value.coverFile = e.target.files[0] }
// Helper for images
const getImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('/uploads')) {
        return `/music${url}`;
    }
    return url;
}

// ... existing code ...

const createPlaylist = async () => {
  if (!playlistForm.value.title) return alert('Дайте название')
  if (!confirm('Создать плейлист из ' + tracks.value.length + ' треков?')) return
  try {
    const formData = new FormData()
    formData.append('title', playlistForm.value.title)
    if (playlistForm.value.coverFile) formData.append('cover', playlistForm.value.coverFile)
    await axios.post('/api/admin/playlists', formData, { 
        headers: { 'x-admin-id': props.user.id, 'Content-Type': 'multipart/form-data' } 
    })
    alert('Готово!')
    showPlaylistModal.value = false
    tracks.value = []
    playlistForm.value = { title: '', coverFile: null }
    activeTab.value = 'playlists'
    fetchPlaylists()
  } catch (e) { 
      console.error(e); 
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
  }
}

// ... existing code ...


const deletePlaylist = async (id) => {
    if (!confirm('Удалить плейлист?')) return
    try {
        await axios.delete(`/api/admin/playlists/${id}`, {
            headers: { 'x-admin-id': props.user.id }
        })
        playlists.value = playlists.value.filter(p => p.id !== id)
    } catch (e) {
        console.error(e)
        alert('Не удалось удалить')
    }
}

onMounted(() => {
  fetchQueue()
})
</script>

<template>
  <div class="space-y-6 pb-24">
    <!-- Header with Tabs -->
    <div class="sticky top-0 bg-brand-dark/95 backdrop-blur-sm z-20 pt-4 pb-2 border-b border-white/5 px-4">
      <div class="flex justify-between items-center mb-4">
         <h2 class="text-3xl font-black text-white tracking-tight italic uppercase">Admin <span class="text-brand-yellow">Area</span></h2>
         <button v-if="activeTab==='queue' && tracks.length > 0" @click="showPlaylistModal=true" class="bg-brand-yellow text-brand-dark px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide shadow-lg active:scale-95 hover:bg-yellow-400 transition-colors">
            В плейлист ({{ tracks.length }})
         </button>
      </div>
      <div class="flex space-x-4">
         <button @click="activeTab='queue'; fetchQueue()" :class="activeTab==='queue' ? 'text-brand-yellow border-b-2 border-brand-yellow' : 'text-gray-500 hover:text-gray-300'" class="pb-2 font-bold flex-1 text-sm uppercase tracking-wider transition-all">
            Очередь
         </button>
         <button @click="activeTab='playlists'; fetchPlaylists()" :class="activeTab==='playlists' ? 'text-brand-yellow border-b-2 border-brand-yellow' : 'text-gray-500 hover:text-gray-300'" class="pb-2 font-bold flex-1 text-sm uppercase tracking-wider transition-all">
            Плейлисты
         </button>
      </div>
    </div>

    <!-- QUEUE TAB -->
    <div v-if="activeTab === 'queue'" class="px-4">
       <div v-if="loading" class="text-center py-10 opacity-50 text-white">Loading...</div>
       <div v-else-if="tracks.length === 0" class="text-center py-12 text-gray-500 bg-brand-gray/20 border border-white/5 rounded-2xl flex flex-col items-center">
          <span class="text-4xl mb-2">🧹</span>
          <span class="font-bold">Пусто</span>
       </div>
       
       <div v-else class="space-y-6">
          <div v-for="group in groupedTracks" :key="group.user?.id" class="space-y-2">
             <div class="flex items-center space-x-2 px-1">
                <div class="w-8 h-8 rounded-full bg-brand-yellow text-brand-dark flex items-center justify-center font-black text-xs border border-brand-yellow/50 shadow-[0_0_10px_rgba(255,200,0,0.2)]">
                   {{ group.user?.firstName?.[0] }}
                </div>
                <div>
                   <p class="font-bold text-white leading-none">{{ group.user?.firstName }}</p>
                   <p class="text-[10px] text-brand-yellow">@{{ group.user?.username }}</p>
                </div>
             </div>
             
             <!-- Track Item -->
             <div v-for="track in group.tracks" :key="track.id" class="relative overflow-hidden rounded-xl group touch-pan-y shadow-sm">
                <!-- Delete bg -->
                <div class="absolute inset-0 bg-red-500 flex items-center justify-end px-6">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-white">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                </div>
                
                <div class="bg-brand-gray relative z-10 transition-transform duration-200 border border-white/5 rounded-xl overflow-hidden group"
                     :class="{'translate-x-[-80px]': swipedTrackId === track.id}"
                     @touchstart="onTouchStart($event, track.id)" @touchend="onTouchEnd($event, track.id)">
                   
                   <!-- View Mode -->
                   <div v-if="editingTrack?.id !== track.id" class="flex items-stretch min-h-[5rem]">
                      <!-- Cover -->
                      <div class="w-20 shrink-0 relative border-r border-white/5 bg-brand-dark flex items-center justify-center">
                         <img v-if="track.coverUrl" :src="track.coverUrl" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity">
                         <div v-else class="text-xl">🎵</div>
                      </div>

                      <!-- Content -->
                      <div class="flex-1 p-3 min-w-0 flex flex-col justify-center">
                         <div class="flex justify-between items-center gap-3">
                             <div class="flex-1 min-w-0">
                                <p class="font-bold text-base text-white truncate leading-tight">{{ track.title }}</p>
                                <p class="text-xs text-gray-400 truncate mt-0.5">{{ track.artist }}</p>
                                <a :href="track.url" target="_blank" class="text-[10px] text-brand-yellow/70 hover:text-brand-yellow truncate block mt-1 transition-colors uppercase font-bold tracking-wider" @click.stop>LINK ↗</a>
                             </div>

                             <!-- Actions -->
                             <div class="flex items-center gap-1 shrink-0">
                                <button @click.stop="startEdit(track)" class="p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                    </svg>
                                </button>
                                <button @click.stop="deleteTrack(track.id)" class="hidden md:flex p-2 text-red-400 hover:text-red-300 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors">
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                                   </svg>
                                </button>
                             </div>
                         </div>
                      </div>
                   </div>

                   <!-- Edit Form -->
                   <div v-else class="space-y-2 p-3" @click.stop>
                      <input v-model="editingTrack.artist" class="w-full text-sm p-2 rounded-lg bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none" placeholder="Artist">
                      <input v-model="editingTrack.title" class="w-full text-sm p-2 rounded-lg bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none" placeholder="Title">
                       <input v-model="editingTrack.url" class="w-full text-xs p-2 rounded-lg bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none" placeholder="Link">
                       <input v-model="editingTrack.coverUrl" class="w-full text-xs p-2 rounded-lg bg-brand-dark border border-white/10 text-white placeholder-gray-600 focus:border-brand-yellow/50 outline-none" placeholder="Cover URL">
                       <div class="flex gap-2">
                          <button @click="deleteTrack(track.id)" class="px-3 py-2 text-xs font-bold bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">
                              🗑️
                          </button>
                          <button @click="editingTrack=null" class="flex-1 py-2 text-xs font-bold bg-brand-dark rounded-lg text-gray-400 hover:text-white">Отмена</button>
                          <button @click="saveEdit" class="flex-1 py-2 text-xs font-bold bg-brand-yellow text-brand-dark rounded-lg hover:bg-yellow-400">Сохранить</button>
                       </div>
                   </div>
                </div>
                <button v-if="swipedTrackId === track.id" @click.stop="deleteTrack(track.id)" class="absolute inset-y-0 right-0 w-[80px] z-20 opacity-0"></button>
             </div>
          </div>
       </div>
    </div>

    <!-- PLAYLISTS TAB -->
    <div v-if="activeTab === 'playlists'" class="px-4 space-y-4">
       <div v-if="playlists.length === 0" class="text-center py-10 text-gray-500 bg-brand-gray/20 rounded-2xl border border-white/5">Архив пуст</div>
       <div v-for="pl in playlists" :key="pl.id" @click="openPlaylistDetails(pl.id)" 
            class="bg-brand-gray/20 border border-white/5 rounded-2xl overflow-hidden shadow-lg active:opacity-80 transition-all hover:border-brand-yellow/30">
          <div class="aspect-video bg-gray-200 relative">
             <img v-if="pl.coverUrl" :src="getImageUrl(pl.coverUrl)" class="w-full h-full object-cover">
             <div v-else class="absolute inset-0 flex items-center justify-center text-tg-hint opacity-30 font-bold text-4xl">🎵</div>
             <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                <h3 class="text-white font-bold text-lg truncate">{{ pl.title }}</h3>
                <p class="text-white/70 text-xs">{{ pl._count?.tracks || 0 }} треков • {{ new Date(pl.createdAt).toLocaleDateString() }}</p>
             </div>
             
             <!-- Delete Button -->
             <button @click.stop="deletePlaylist(pl.id)" class="absolute top-2 right-2 p-2 bg-red-500/80 rounded-full text-white hover:bg-red-600 transition-colors shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
             </button>
          </div>
       </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showPlaylistModal" class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
       <div class="bg-brand-dark w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 animate-slide-up border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <h3 class="text-xl font-black text-center text-white uppercase italic">Создать Плейлист</h3>
          <input v-model="playlistForm.title" class="w-full p-4 rounded-xl bg-brand-gray/30 text-white placeholder-gray-500 font-bold text-lg outline-none focus:ring-2 ring-brand-yellow focus:bg-brand-gray/50 transition-colors" placeholder="Название">
          <label class="block bg-brand-gray/30 p-4 rounded-xl text-center text-gray-400 text-sm font-medium active:bg-brand-gray/50 transition-colors cursor-pointer border border-dashed border-gray-600 hover:border-brand-yellow hover:text-brand-yellow">
             <span v-if="!playlistForm.coverFile">📸 Загрузить обложку</span>
             <span v-else class="text-brand-yellow font-bold">Обложка выбрана!</span>
             <input type="file" @change="handleFileUpload" hidden accept="image/*">
          </label>
          <button @click="createPlaylist" class="w-full py-4 bg-brand-yellow text-brand-dark rounded-xl font-black text-lg shadow-lg hover:bg-yellow-400 transition-colors uppercase tracking-wide">Создать</button>
          <button @click="showPlaylistModal=false" class="w-full py-4 text-gray-500 font-medium hover:text-white transition-colors">Отмена</button>
       </div>
    </div>

    <!-- Details Modal -->
    <div v-if="showPlaylistDetails && selectedPlaylist" class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
       <div class="bg-brand-dark w-full h-[90vh] sm:h-auto sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col animate-slide-up overflow-hidden border-t border-white/10 shadow-2xl">
          <div class="p-4 border-b border-white/5 flex justify-between items-center bg-brand-dark/95 backdrop-blur sticky top-0 z-10">
             <h3 class="font-bold text-lg text-white truncate flex-1 pr-4">{{ selectedPlaylist.title }}</h3>
             <button @click="showPlaylistDetails=false" class="text-gray-400 hover:text-brand-yellow text-2xl px-2 transition-colors">×</button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 space-y-6">
             <div class="aspect-video bg-brand-gray/20 rounded-xl overflow-hidden relative shadow-inner border border-white/5">
                <img v-if="selectedPlaylist.coverUrl" :src="getImageUrl(selectedPlaylist.coverUrl)" class="w-full h-full object-cover">
                <div v-else class="w-full h-full flex items-center justify-center text-6xl opacity-20">💿</div>
             </div>
             
             <!-- Service Link -->
             <div class="space-y-1">
                <label class="text-[10px] font-bold text-gray-500 uppercase ml-1 tracking-widest">Ссылка на сервис</label>
                <div class="flex gap-2">
                   <input v-model="selectedPlaylist.serviceUrl" placeholder="https://music.yandex.ru/..." 
                          class="flex-1 p-3 rounded-xl bg-brand-gray/30 text-white text-sm border border-white/5 outline-none focus:border-brand-yellow/50 focus:bg-brand-gray/50 transition-all">
                   <button @click="savePlaylistLink" class="bg-brand-yellow text-brand-dark px-4 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-yellow-400 transition-colors">Save</button>
                </div>
             </div>

             <!-- Yandex Export -->
             <div class="space-y-1 bg-brand-yellow/5 p-3 rounded-xl border border-brand-yellow/10">
                <label class="text-[10px] font-bold text-brand-yellow uppercase ml-1 tracking-widest">Yandex Export</label>
                <div class="flex flex-col gap-2">
                   <input v-model="yandexToken" placeholder="OAuth Token" type="password"
                          class="w-full p-3 rounded-xl bg-brand-dark/50 text-white text-sm border border-brand-yellow/20 outline-none focus:border-brand-yellow focus:bg-brand-dark transition-all placeholder-white/20">
                   <button @click="exportYandex" :disabled="exporting"
                           class="w-full bg-brand-yellow text-brand-dark py-3 rounded-xl font-black text-sm uppercase tracking-wider hover:bg-yellow-400 transition-colors disabled:opacity-50">
                       {{ exporting ? 'Exporting...' : 'Export to Yandex Music' }}
                   </button>
                   <p v-if="exportStatus" class="text-xs text-center font-bold" :class="exportStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'">
                       {{ exportStatus }}
                   </p>
                </div>
             </div>

             <!-- Tracks Table -->
             <div class="space-y-2">
                <label class="text-[10px] font-bold text-gray-500 uppercase ml-1 tracking-widest">Треки ({{ selectedPlaylist.tracks?.length }})</label>
                <div class="bg-brand-gray/20 rounded-xl overflow-hidden text-sm border border-white/5">
                   <div v-for="(t, i) in selectedPlaylist.tracks" :key="t.id" class="p-3 border-b border-white/5 last:border-0 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div class="truncate pr-2">
                         <p class="font-bold truncate text-white">{{ t.title }}</p>
                         <p class="text-xs text-gray-400 truncate">{{ t.artist }}</p>
                      </div>
                      <div class="text-right shrink-0">
                         <p class="text-[10px] bg-brand-yellow/10 px-2 py-1 rounded-full text-brand-yellow font-bold uppercase tracking-wide border border-brand-yellow/20">
                            {{ t.submittedBy?.firstName }}
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up { animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
