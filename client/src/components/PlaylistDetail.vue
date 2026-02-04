<template>
  <div class="space-y-6" v-if="playlist">
    <!-- Header -->
    <div class="relative rounded-3xl overflow-hidden bg-brand-dark border border-white/5">
       <div class="h-32 bg-cover bg-center opacity-40 blur-sm" :style="{ backgroundImage: `url(${playlist.coverUrl || '/images/logo.png'})` }"></div>
       <div class="absolute inset-0 bg-gradient-to-t from-brand-dark to-transparent"></div>
       
       <div class="absolute bottom-0 left-0 p-6 w-full flex items-end justify-between">
          <div>
              <h2 class="text-2xl font-black text-white leading-none shadow-black drop-shadow-md">{{ playlist.title }}</h2>
              <p class="text-xs text-gray-400 font-bold uppercase tracking-wider mt-2">{{ tracks.length }} треков</p>
          </div>
          <button @click="$emit('back')" class="bg-white/10 p-2 rounded-full backdrop-blur-md active:bg-white/20 transition-colors">
             <span class="text-xl">✕</span>
          </button>
       </div>
    </div>

    <!-- External Link -->
    <a v-if="playlist.serviceUrl" :href="playlist.serviceUrl" target="_blank" class="block w-full py-3 bg-brand-yellow/10 text-brand-yellow font-bold text-center rounded-xl border border-brand-yellow/20 hover:bg-brand-yellow/20 transition-all uppercase text-sm tracking-wider">
        Слушать (Service) ↗
    </a>

    <!-- Tracks -->
    <div class="space-y-3">
       <div v-for="track in tracks" :key="track.id" class="flex gap-3 items-center bg-brand-gray/40 p-3 rounded-2xl border border-white/5">
           <!-- Cover -->
           <div class="w-12 h-12 rounded-lg bg-black shrink-0 relative overflow-hidden">
               <img v-if="track.coverUrl" :src="track.coverUrl" class="w-full h-full object-cover" />
               <div v-else class="w-full h-full flex items-center justify-center text-xs">🎵</div>
           </div>

           <!-- Info -->
           <div class="flex-1 min-w-0">
               <div class="font-bold text-white truncate text-sm leading-tight">{{ track.title }}</div>
               <div class="text-gray-400 text-xs truncate mt-0.5">{{ track.artist }}</div>
               <div class="text-[10px] text-gray-600 mt-1 flex gap-2">
                   <span v-if="track.submittedBy" class="text-gray-500">by {{ track.submittedBy.firstName }}</span>
               </div>
           </div>

           <!-- Actions -->
           <div class="flex flex-col items-end gap-1">
               <button 
                  @click="toggleLike(track)"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
                  :class="track.isLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-gray-400 hover:text-white'"
               >
                   <span class="text-base">{{ track.isLiked ? '❤️' : '🤍' }}</span>
                   <span class="text-xs font-bold">{{ track.likesCount }}</span>
               </button>
               <a :href="track.url" target="_blank" class="text-[10px] text-gray-500 hover:text-brand-yellow uppercase font-bold tracking-wider px-2">Link ↗</a>
           </div>
       </div>
    </div>
  </div>
  <div v-else-if="loading" class="flex justify-center py-10">
     <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-yellow"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps(['playlistId', 'userId'])
const emit = defineEmits(['back'])

const playlist = ref(null)
const tracks = ref([])
const loading = ref(true)

const fetchDetails = async () => {
    try {
        const headers = props.userId ? { 'x-user-id': props.userId } : {}
        const res = await axios.get(`/api/playlists/${props.playlistId}`, { headers })
        playlist.value = res.data
        tracks.value = res.data.tracks || []
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
}

const toggleLike = async (track) => {
    if (!props.userId) {
        alert('Зайдите через Telegram, чтобы лайкать!')
        return
    }
    
    // Optimistic UI
    const wasLiked = track.isLiked
    track.isLiked = !wasLiked
    track.likesCount += wasLiked ? -1 : 1

    try {
        const res = await axios.post(`/api/tracks/${track.id}/like`, {}, {
            headers: { 'x-user-id': props.userId }
        })
        // Sync real state
        track.isLiked = res.data.liked
    } catch (e) {
        console.error(e)
        // Revert
        track.isLiked = wasLiked
        track.likesCount += wasLiked ? 1 : -1
    }
}

onMounted(() => {
    fetchDetails()
})
</script>
