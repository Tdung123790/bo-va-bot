const reduce=matchMedia('(prefers-reduced-motion: reduce)');

function initContactMotion(){
  if(reduce.matches||!('IntersectionObserver'in window)||!Element.prototype.animate)return;
  const cards=[...document.querySelectorAll('.contact-cards article')];
  const targets=[...cards,document.querySelector('.contact-main__form'),document.querySelector('.contact-side')].filter(Boolean);
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const element=entry.target;
      const cardIndex=cards.indexOf(element);
      const from=cardIndex>=0?'translateY(30px)':element.classList.contains('contact-side')?'translateX(30px)':'translateX(-30px)';
      element.animate([{opacity:0,transform:from},{opacity:1,transform:'none'}],{
        duration:cardIndex>=0?300:800,
        delay:cardIndex>=0?cardIndex*100:0,
        easing:'cubic-bezier(0.4, 0, 0.2, 1)'
      });
      observer.unobserve(element);
    }
  },{threshold:.12});
  targets.forEach(target=>observer.observe(target));
  reduce.addEventListener('change',event=>{
    if(!event.matches)return;
    observer.disconnect();
    targets.forEach(target=>target.getAnimations().forEach(animation=>animation.cancel()));
  },{once:true});
}

initContactMotion();
