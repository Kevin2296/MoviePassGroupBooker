const projectUrl = String(window.MoviePassConfig?.projectUrl || '').replace(/\/+$/, '');
const contact = document.querySelector('#project-contact');
if (projectUrl && /^https:\/\/github\.com\//i.test(projectUrl)) {
  contact.innerHTML = '';
  const link = document.createElement('a');
  link.href = `${projectUrl}/issues`;
  link.textContent = 'Open een support- of probleemmelding op GitHub';
  link.rel = 'noopener';
  contact.append(link);
}
