# Small Imba islands enhance complete HTML pages. Links keep normal browser
# navigation; no router, intercepted fetch navigation or document replacement.
import {mount} from 'imba'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

tag project-finder
	prop projects = []
	query = ''
	handler = null

	get matches
		const term = query.trim().toLowerCase()
		return projects.filter(do(project) (project.name + ' ' + project.description + ' ' + project.tags.join(' ')).toLowerCase().includes(term))

	def open
		query = ''
		commit()
		self.querySelector('dialog').showModal()
		self.querySelector('input').focus()

	def close
		self.querySelector('dialog').close()

	def shortcut(event)
		const target = event.target
		if event.key == '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !target.closest('input,textarea,select,[contenteditable]')
			event.preventDefault()
			open()

	def mount
		handler = shortcut.bind(self)
		window.addEventListener('keydown', handler)

	def unmount
		window.removeEventListener('keydown', handler)

	<self.project-finder>
		<button.chip type='button' @click=open>
			'Find a project '
			<kbd> '/'
		<dialog.project-dialog aria-label='Find an FFXIV project'>
			<div.finder-heading>
				<h2> 'Find your next tool'
				<button.chip type='button' @click=close aria-label='Close project search'> 'Close'
			<label.finder-search>
				<span> 'Search projects'
				<input type='search' bind=query placeholder='HUD, music, glasses, terminal…' autocomplete='off'>
			<p.finder-count role='status' aria-live='polite'> "{matches.length} projects"
			<ul.finder-results>
				for project in matches
					<li key=project.id>
						<a href=project.page>
							<strong> project.name
							<span> project.punchline
							<small> project.status
				if matches.length == 0
					<li.finder-empty> 'No matching projects. Try “HUD”, “music” or “glasses”.'

tag queue-controls
	prop model
	query = ''
	project = ''
	status = ''
	visible = 0

	def apply
		const term = query.trim().toLowerCase()
		visible = 0
		for entry in model.entries
			const row = document.getElementById(entry.id)
			const show = (!project || entry.mod == project) && (!status || entry.status == status) && (entry.title + ' ' + entry.pitch + ' ' + entry.mod).toLowerCase().includes(term)
			if row
				const wasHidden = row.hidden
				row.hidden = !show
				if show
					visible++
					if wasHidden && !reducedMotion.matches
						row.animate([{opacity:0},{opacity:1}], {duration:160, easing:'ease-out'})
		const url = new URL(window.location.href)
		for [key,value] of [['q',query],['project',project],['status',status]]
			if value
				url.searchParams.set(key,value)
			else
				url.searchParams.delete(key)
		window.history.replaceState(null,'',url)

	def changeQuery(event)
		query = event.target.value
		apply()

	def changeProject(event)
		project = event.target.value
		apply()

	def changeStatus(event)
		status = event.target.value
		apply()

	def clear
		query = project = status = ''
		apply()

	def mount
		const params = new URL(window.location.href).searchParams
		query = params.get('q') || ''
		project = params.get('project') || ''
		status = params.get('status') || ''
		# Old or mistyped links must not hide the queue behind an empty select.
		if !Object.hasOwn(model.counts, project)
			project = ''
		if !['queued', 'verification_pending'].includes(status)
			status = ''
		apply()
		# Mount runs after the first render and outside an Imba event handler.
		commit()

	def unmount
		for entry in model.entries
			const row = document.getElementById(entry.id)
			if row
				row.hidden = false

	<self.queue-controls>
		<div.queue-fields>
			<label>
				<span> 'Find a feature'
				<input type='search' bind=query @input=changeQuery placeholder='Search the accepted queue' autocomplete='off'>
			<label>
				<span> 'Project'
				<select bind=project @change=changeProject>
					<option value=''> 'All projects'
					for mod in Object.keys(model.counts)
						<option value=mod key=mod> mod
			<label>
				<span> 'Delivery status'
				<select bind=status @change=changeStatus>
					<option value=''> 'All accepted features'
					<option value='queued'> 'Implementation review'
					<option value='verification_pending'> 'Acceptance pending'
			<button.chip type='button' @click=clear> 'Clear filters'
		<p.queue-result role='status' aria-live='polite'> "{visible} of {model.total} features"
		if visible == 0
			<p> 'No matches. Clear the filters to see the full accepted queue.'

def enhance
	const finderSlot = document.querySelector('[data-project-finder]')
	if finderSlot
		try
			const response = await fetch('/mods/ffxiv/projects.json',{credentials:'omit'})
			if response.ok
				const registry = await response.json()
				const finder = mount(<project-finder projects=registry.projects>,finderSlot)
				const fallback = finderSlot.querySelector('[data-finder-fallback]')
				if fallback
					fallback.remove()
		catch
			# Keep the normal project-index link when enhancement is unavailable.
			undefined
	const queueSlot = document.querySelector('[data-queue-controls]')
	if queueSlot
		try
			const response = await fetch('/mods/ffxiv/roadmap/queue.json',{credentials:'omit'})
			if response.ok
				const model = await response.json()
				mount(<queue-controls model=model>,queueSlot)
		catch
			# The server-rendered table remains complete and readable.
			undefined

enhance()
