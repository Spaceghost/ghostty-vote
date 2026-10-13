# One theme controller across ordinary pages, ballots and previews. Apply the
# saved preference before paint; storage failure leaves the OS default intact.
const key = 'ghostty-vote:theme'
const root = document.documentElement

def readTheme
	try
		const value = window.localStorage.getItem(key)
		return ['dark','light'].includes(value) ? value : ''
	catch
		return ''

def applyTheme(value)
	if value
		root.dataset.theme = value
	else
		delete root.dataset.theme
	const button = document.querySelector('#theme')
	if button
		button.textContent = 'theme: ' + (value || 'auto')
		button.setAttribute('aria-label', 'Colour theme: ' + (value || 'automatic') + '. Change theme')

applyTheme(readTheme())

def start
	const button = document.querySelector('#theme')
	if !button || button.familyThemeOwned
		return
	button.familyThemeOwned = true
	button.addEventListener('click', do
		const value = root.dataset.theme || ''
		const next = value == '' ? 'dark' : value == 'dark' ? 'light' : ''
		try
			if next
				window.localStorage.setItem(key,next)
			else
				window.localStorage.removeItem(key)
		catch
			undefined
		applyTheme(next)
	)
	applyTheme(readTheme())

window.addEventListener('storage', do(event)
	if event.key == key
		applyTheme(readTheme())
)

if document.readyState == 'loading'
	document.addEventListener('DOMContentLoaded',start,{once:true})
else
	start()
