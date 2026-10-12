## Product walkthrough

> A reader's journey through Finn Lens, from saying what matters to them to seeing how the cars on the page compare.
>
> ---
>
> ### 1. Meet Lens
>
> When you first install Finn Lens, it opens the listings page on finn.com and introduces itself in the chat.
>
> ![Finn Lens introduction](../browser-extension/assets/images/walkthrough/01-meet-lens.webp)
>
> Lens explains what it does, how the conversation works, and what to expect from the results. Before judging the cars, it wants to understand the person choosing them.
>
> ---
>
> ### 2. Tell Lens about your life
>
> The conversation asks about your life in four sections. You answer by tapping, or with a value of your own where a question allows one. Where an answer changes what Lens checks, a follow-up asks for the detail, and each answer says what Lens will check for it and why. The **i** beside an answer says more.
>
> > #### 2.1. Who rides with you?
> >
> > ![Passenger and child-seat questions](../browser-extension/assets/images/walkthrough/02-who-rides-with-you.webp)
> >
> > Lens starts with who regularly rides with you: kids, adults or teens, or a dog. Each changes what makes a car suitable.
> >
> > Picking kids asks which child seat you need. In this example, Lens names rear doors as relevant and checks for ISOFIX child-seat anchors.
> >
> > ---
> >
> > #### 2.2. Where and how do you drive?
> >
> > ![Driving habits and parking questions](../browser-extension/assets/images/walkthrough/03-where-and-how-you-drive.webp)
> >
> > Next come your driving habits. City driving, traffic, long distances and where you park can all change which features are useful to you.
> >
> > Picking city driving asks where you usually park. For an open car park, Lens explains that reversing out of a space into traffic is where rear cross-traffic alert helps.
> >
> > The purpose isn't to recommend every driver-assistance feature there is. It's to find the ones that make sense for how you drive.
> >
> > ---
> >
> > #### 2.3. What does the car need to cope with?
> >
> > ![Weather and carrying requirements](../browser-extension/assets/images/walkthrough/04-what-the-car-copes-with.webp)
> >
> > Lens also asks about the conditions the car has to handle and what you carry. Cold winters with snow and ice call for different equipment than hot summers, and the weekly shop for different equipment than bikes or bulky things.
> >
> > Picking hot summers, for instance, has Lens check for ventilated seats, suggest 3-zone climate control, and make sure the car has air conditioning.
> >
> > ---
> >
> > #### 2.4. Build on earlier answers
> >
> > ![Comfort preferences and recommended features](../browser-extension/assets/images/walkthrough/05-recommended-comforts.webp)
> >
> > As the conversation goes on, Lens recommends options based on what you've already told it. In this example, I said that winters bring snow and ice and are cold, and that I spend a lot of time on the road. When I reached comfort, Lens recommended a heated steering wheel, and its tooltip says why:
> >
> > > Recommended because you said winters bring snow and ice, winters are cold, and you spend a lot of time on the road.
> >
> > So the options aren't a static list: earlier answers decide what's suggested. A recommendation is only a suggestion, and you decide whether it goes into your priorities.
> >
> > ---
> >
> > #### 2.5. Tell Lens what else matters to you
> >
> > ![Additional preferences and natural-language summary](../browser-extension/assets/images/walkthrough/06-what-else-matters.webp)
> >
> > Beyond practical needs, Lens asks about comfort, how green the car should be, your budget and how long you need the car. It then says your answers back in plain words:
> >
> > > **You:** Comfort matters to me — ventilated seats, lumbar support and premium sound. I care about the environment — clean for its fuel type.
> > >
> > > **Lens:** Got it — comfort matters to you and you care about the environment.
> >
> > Budget and rental period are handled apart from these preferences. In this example, Lens takes €700 a month as a limit and works out the rental term that covers the requested period. A preference helps Lens compare suitable cars; a limit can rule a car out.
> >
> > ---
> >
> > #### 2.6. Understand the choices Lens recommends
> >
> > ![Colour-coded choices and explanations](../browser-extension/assets/images/walkthrough/07-deal-breakers-and-sealers.webp)
> >
> > Lens marks different kinds of choices with colours, and each option's tooltip says what it means and why it may be relevant. If you've said you regularly meet snow and ice, for example, Lens may recommend all-wheel drive (AWD).
> >
> > ![All-wheel-drive explanation](../browser-extension/assets/images/walkthrough/08-all-wheel-drive-tip.webp)
> >
> > Its tooltip gives the trade-off: AWD helps traction when pulling away on snow, but it doesn't help braking on snow or replace winter tyres. The source link lets you check the claim rather than take Lens's word for it.
>
> ---
>
> ### 3. Review and refine Lens's understanding
>
> Before evaluating the cars, Lens summarizes what it has understood.
>
> > #### 3.1. See how your answers are interpreted
> >
> > ![Summary of answers and priorities](../browser-extension/assets/images/walkthrough/09-summary-of-answers.webp)
> >
> > The summary brings together your answers, what Lens will check for each, and how much each counts: **Top priority** (4), **Important** (2) or **Nice to have** (1), each counting twice the next. A car can still win without meeting a top priority, but it has to make up for it elsewhere.
> >
> > A dashed outline on how much something counts marks Lens's own guess from your answers, not a level you picked. It shows where Lens is interpreting your needs rather than recording your choices.
> >
> > ---
> >
> > #### 3.2. Confirm or correct the summary
> >
> > ![Prompt to confirm the summary](../browser-extension/assets/images/walkthrough/10-confirm-the-summary.webp)
> >
> > Lens then asks whether its understanding looks right. If it doesn't, **This doesn't look right** opens the adjustment panel.
> >
> > ![Editable summary and adjustment panel](../browser-extension/assets/images/walkthrough/11-adjust-panel.webp)
> >
> > The panel shows the same summary in a form you can edit: take out or add what Lens checks, change how much something counts, or answer a question again, until it says what you meant. Lens evaluates the cars only after you've had that chance to correct it.
> >
> > ---
> >
> > #### 3.3. Decide whether to save your settings
> >
> > ![Save settings prompt](../browser-extension/assets/images/walkthrough/12-save-settings.webp)
> >
> > Once you confirm, Lens asks whether to keep your answers as your settings or use them for this chat only. Saved settings are where future chats start, so you don't repeat the whole conversation. You can still change them in a chat, and review or forget them in Settings.
>
> ---
>
> ### 4. Explore your results
>
> Lens then evaluates the cars on the listings page.
>
> > #### 4.1. See how each car fits
> >
> > ![Finn Lens results and fit indicators](../browser-extension/assets/images/walkthrough/13-result-chips.webp)
> >
> > Every car Lens evaluates gets a chip on its card, and the top pick, cars that may still suit you and cars that were ruled out each look different. A chip isn't just a label: clicking it opens that car's drawer, whether it won or not.
> >
> > ---
> >
> > #### 4.2. Inspect the reasoning behind a result
> >
> > ![Detailed breakdown of a car's evaluation](../browser-extension/assets/images/walkthrough/14-result-drawer.webp)
> >
> > The drawer explains the car's outcome: for the top pick, why it came out ahead; for another suitable car, where it fell short of the winner; for a ruled-out car, why it didn't qualify. You can compare the reasoning across cars instead of taking the pick on faith.
> >
> > A top pick is what Lens's predefined scoring model makes of your stated needs and priorities; no AI model is involved. It depends on the vehicle data, the model's assumptions and your answers, so treat it as decision support, not a guarantee that the car is right for you.
>
> ---
>
> ### 5. Try it yourself
>
> Finn Lens isn't on the Chrome Web Store. This beta is a package you load into Chrome yourself, on a computer; it takes about two minutes.
>
> **[Download `finn-lens-0.9.1-chrome.zip`](https://github.com/orjwan-alrajaby/finn-lens/raw/main/releases/finn-lens-0.9.1-chrome.zip)**, then:
>
> 1. Unzip it. You get a folder holding `manifest.json`.
> 2. Open `chrome://extensions` and switch on **Developer mode** (top right).
> 3. Click **Load unpacked** and choose that folder. Keep the folder where it is: Chrome loads Lens from it each time.
> 4. Lens opens finn.com in a new tab, and its chat opens by itself. If it doesn't, click the **Lens** bubble in the bottom-right corner.
>
> It runs only on www.finn.com, and tabs that were already open need a reload. Chrome may warn about extensions in developer mode; that's expected for a build that isn't from the store. Once it's running, the beta note suggests [what to try in your first five minutes](BETA.md#try-it-five-minutes).

---

Finn Lens is an independent project. It isn't made by, or affiliated with, FINN.
