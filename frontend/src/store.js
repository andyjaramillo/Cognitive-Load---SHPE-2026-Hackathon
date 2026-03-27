import { configureStore, createSlice } from '@reduxjs/toolkit'

const genId = () => Math.random().toString(36).slice(2, 10)

function mapTasks(tasks = []) {
  return tasks.map(t => ({
    id:               t.id || genId(),
    task_name:        t.task_name || t.name || 'Task',
    duration_minutes: t.duration_minutes || 15,
    priority:         t.priority != null && t.priority !== 2 ? t.priority : null,  // 1=high, 3=low, null=none
    motivation_nudge: t.motivation_nudge || '',
    due_date:         t.due_date || null,
    due_label:        t.due_label || null,
    done:             t.done || t.status === 'done' || false,
    paused:           t.paused || false,
    timerStarted:     null,
    nudgeText:        null,
    userSetTime:      false,
  }))
}

// ── Preferences slice ────────────────────────────────────────────────────── //

const prefsSlice = createSlice({
  name: 'prefs',
  initialState: {
    name:               'there',
    communicationStyle: 'balanced',
    onboardingComplete: false,
    walkthroughComplete: false,
    readingLevel: 'standard',
    fontChoice:   'default',
    bionicReading: false,
    lineHeight:    1.6,
    letterSpacing: 0,
    timerLengthMinutes: 25,
    focusMode:    false,
    granularity:  'normal',
    colorTheme:   'calm',
    pebbleColor:  'sage',
    language:     'en',
    loaded:       false,
  },
  reducers: {
    setPrefs(state, action) {
      return { ...state, ...action.payload, loaded: true }
    },
    toggleFocusMode(state) { state.focusMode = !state.focusMode },
    toggleBionic(state)    { state.bionicReading = !state.bionicReading },
  },
})

// ── Tasks slice ───────────────────────────────────────────────────────────── //
// Shape: groups: [{ id, name, source, tasks: [{id, task_name, duration_minutes,
//                   motivation_nudge, done, paused, timerStarted, nudgeText}] }]

const tasksSlice = createSlice({
  name: 'tasks',
  initialState: {
    groups:       [],
    categories:   [],   // [{ id, name, color: 'sage'|'sky'|'lilac'|'amber' }]
    focusGroupId: null,
    focusTaskId:  null,
    loading:      false,
    error:        null,
  },
  reducers: {
    // Add a new group (from Documents page or smart AI decomposition)
    // Accepts optional `id` so callers can pre-generate it (needed for navigate highlight state)
    addGroup(state, action) {
      const { id, name, source = 'manual', tasks = [], groupColor = 'sage' } = action.payload
      state.groups.push({ id: id || genId(), name, source, groupColor, created_at: new Date().toISOString(), tasks: mapTasks(tasks) })
    },

    // Load groups from Cosmos DB (replaces all current groups)
    setGroups(state, action) {
      state.groups = action.payload
    },

    // Only populates from Cosmos if Redux is still empty — prevents race condition
    // where loadTasks resolves AFTER the user already added a group locally
    setGroupsIfEmpty(state, action) {
      if (state.groups.length === 0) {
        state.groups = action.payload
      }
    },

    // Rename a group
    updateGroupName(state, action) {
      const { groupId, name } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (group && name.trim()) group.name = name.trim()
    },

    setGroupColor(state, action) {
      const { groupId, color } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (group) group.groupColor = color
    },

    // Add a single task to the "My Tasks" group (creates it if missing)
    addSimpleTask(state, action) {
      const { task_name, duration_minutes = 15, priority = null, motivation_nudge = '', due_date = null, due_label = null } = action.payload
      let group = state.groups.find(g => g.name === 'My Tasks' && g.source === 'manual')
      if (!group) {
        group = { id: genId(), name: 'My Tasks', source: 'manual', tasks: [] }
        state.groups.push(group)
      }
      group.tasks.push({
        id: genId(), task_name, duration_minutes, priority,
        motivation_nudge, due_date, due_label,
        done: false, paused: false, timerStarted: null, nudgeText: null, userSetTime: false,
      })
    },

    // Add a single task directly to a specific group (inline add inside a group)
    addTaskToGroup(state, action) {
      const { groupId, task_name, duration_minutes = 15, priority = null, id, motivation_nudge = '' } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (!group) return
      group.tasks.push({
        id: id || genId(), task_name, duration_minutes, priority,
        motivation_nudge, due_date: null, due_label: null,
        done: false, paused: false, timerStarted: null, nudgeText: null, userSetTime: false,
      })
    },

    completeTask(state, action) {
      const { groupId, taskId } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.done = true
    },

    uncompleteTask(state, action) {
      const { groupId, taskId } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.done = false
    },

    pauseTask(state, action) {
      const { groupId, taskId } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.paused = true
    },

    resumeTask(state, action) {
      const { groupId, taskId } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.paused = false
    },

    deleteTask(state, action) {
      const { groupId, taskId } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (!group) return
      group.tasks = group.tasks.filter(t => t.id !== taskId)
      // Clear focus refs if they pointed to the deleted task
      if (state.focusTaskId === taskId) state.focusTaskId = null
      // Remove empty non-manual groups and clear group focus ref
      if (group.tasks.length === 0 && group.source !== 'manual') {
        state.groups = state.groups.filter(g => g.id !== groupId)
        if (state.focusGroupId === groupId) { state.focusGroupId = null; state.focusTaskId = null }
      }
    },

    // Replace a single task with sub-tasks (Break down)
    replaceTask(state, action) {
      const { groupId, taskId, newTasks } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (!group) return
      const idx = group.tasks.findIndex(t => t.id === taskId)
      if (idx === -1) return
      group.tasks.splice(idx, 1, ...mapTasks(newTasks))
    },

    setTaskNudge(state, action) {
      const { groupId, taskId, nudgeText } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.nudgeText = nudgeText
    },

    updateTask(state, action) {
      const { groupId, taskId, task_name, duration_minutes, motivation_nudge, priority, due_date, due_label, userSetTime } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (!task) return
      if (task_name        !== undefined) task.task_name        = task_name
      if (duration_minutes !== undefined) task.duration_minutes = duration_minutes
      if (motivation_nudge !== undefined) task.motivation_nudge = motivation_nudge
      if (priority         !== undefined) task.priority         = priority
      if (due_date         !== undefined) task.due_date         = due_date
      if (due_label        !== undefined) task.due_label        = due_label
      if (userSetTime      !== undefined) task.userSetTime      = userSetTime
    },

    setTaskTimer(state, action) {
      const { groupId, taskId } = action.payload
      const task = state.groups.find(g => g.id === groupId)?.tasks.find(t => t.id === taskId)
      if (task) task.timerStarted = Date.now()
    },

    // Move a task to the end of uncompleted tasks in its group (skip)
    skipTask(state, action) {
      const { groupId, taskId } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (!group) return
      const idx = group.tasks.findIndex(t => t.id === taskId)
      if (idx === -1) return
      const [task] = group.tasks.splice(idx, 1)
      group.tasks.push(task)
    },

    clearAllTasks(state, action) {
      // action.payload = groupId — removes all tasks from the group
      const group = state.groups.find(g => g.id === action.payload)
      if (group) group.tasks = []
    },

    clearCompletedTasks(state, action) {
      // action.payload = groupId (string) OR null/undefined to clear all groups
      const groupId = action.payload
      const targets = groupId
        ? state.groups.filter(g => g.id === groupId)
        : state.groups
      for (const group of targets) {
        group.tasks = group.tasks.filter(t => !t.done)
      }
    },

    deleteGroup(state, action) {
      state.groups = state.groups.filter(g => g.id !== action.payload)
      if (state.focusGroupId === action.payload) { state.focusGroupId = null; state.focusTaskId = null }
    },

    // Merge two or more tasks into one combined task
    // payload: { sourceTaskNames: string[], mergedTask: { task_name, duration_minutes, priority, motivation_nudge } }
    mergeTasks(state, action) {
      const { sourceTaskNames, mergedTask } = action.payload
      // Find which group has the most matches (supports cross-group edge case gracefully)
      let targetGroup = null
      let maxMatches = 0
      for (const group of state.groups) {
        const matches = group.tasks.filter(t => sourceTaskNames.includes(t.task_name)).length
        if (matches > maxMatches) { maxMatches = matches; targetGroup = group }
      }
      if (!targetGroup || maxMatches < 1) return
      // Remember position of the first source task
      const firstIdx = targetGroup.tasks.findIndex(t => sourceTaskNames.includes(t.task_name))
      // Remove all source tasks
      targetGroup.tasks = targetGroup.tasks.filter(t => !sourceTaskNames.includes(t.task_name))
      // Insert merged task at the original position of the first source task
      const insertAt = Math.min(firstIdx, targetGroup.tasks.length)
      targetGroup.tasks.splice(insertAt, 0, {
        id:               Math.random().toString(36).slice(2, 10),
        task_name:        mergedTask.task_name,
        duration_minutes: mergedTask.duration_minutes || 15,
        priority:         mergedTask.priority ?? null,
        motivation_nudge: mergedTask.motivation_nudge || '',
        due_date:         null,
        due_label:        null,
        done:             false,
        paused:           false,
        timerStarted:     null,
        nudgeText:        null,
        userSetTime:      false,
      })
    },

    // Reorder tasks within a group (drag-to-reorder)
    reorderTasks(state, action) {
      const { groupId, oldIndex, newIndex } = action.payload
      const group = state.groups.find(g => g.id === groupId)
      if (!group) return
      const [moved] = group.tasks.splice(oldIndex, 1)
      group.tasks.splice(newIndex, 0, moved)
    },

    reorderGroups(state, action) {
      const { oldIndex, newIndex } = action.payload
      const [moved] = state.groups.splice(oldIndex, 1)
      state.groups.splice(newIndex, 0, moved)
    },

    moveTaskToGroup(state, action) {
      const { taskId, fromGroupId, toGroupId } = action.payload
      const fromGroup = state.groups.find(g => g.id === fromGroupId)
      const toGroup   = state.groups.find(g => g.id === toGroupId)
      if (!fromGroup || !toGroup || fromGroupId === toGroupId) return
      const idx = fromGroup.tasks.findIndex(t => t.id === taskId)
      if (idx === -1) return
      const [task] = fromGroup.tasks.splice(idx, 1)
      toGroup.tasks.push(task)
      // Clean up empty non-manual groups
      if (fromGroup.tasks.length === 0 && fromGroup.source !== 'manual') {
        state.groups = state.groups.filter(g => g.id !== fromGroupId)
        if (state.focusGroupId === fromGroupId) { state.focusGroupId = null; state.focusTaskId = null }
      }
    },

    setFocusGroup(state, action) { state.focusGroupId = action.payload },
    setFocusTask(state, action)  { state.focusTaskId  = action.payload },
    clearFocus(state)            { state.focusGroupId = null; state.focusTaskId = null },

    // Add a category — one per color max
    addCategory(state, action) {
      const { name, color } = action.payload
      if (state.categories.some(c => c.color === color)) return
      state.categories.push({ id: genId(), name: name.trim(), color })
    },

    deleteCategory(state, action) {
      state.categories = state.categories.filter(c => c.id !== action.payload)
    },

    setLoading(state, action) { state.loading = action.payload },
    setError(state, action)   { state.error = action.payload },
    clearAll(state)            { state.groups = []; state.error = null },
  },
})

// ── Summarise slice ──────────────────────────────────────────────────────── //

const summariseSlice = createSlice({
  name: 'summarise',
  initialState: { output: '', streaming: false, error: null },
  reducers: {
    startStream(state) { state.streaming = true; state.output = ''; state.error = null },
    appendChunk(state, action) { state.output += action.payload },
    endStream(state) { state.streaming = false },
    setError(state, action) { state.error = action.payload; state.streaming = false },
    clear(state) { state.output = ''; state.streaming = false; state.error = null },
  },
})

export const prefsActions     = prefsSlice.actions
export const tasksActions     = tasksSlice.actions
export const summariseActions = summariseSlice.actions

export const store = configureStore({
  reducer: {
    prefs:     prefsSlice.reducer,
    tasks:     tasksSlice.reducer,
    summarise: summariseSlice.reducer,
  },
})
