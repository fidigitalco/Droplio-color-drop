# COLOR DROP — COMPLETE 3D iOS MOBILE GAME

Act as a professional mobile game development studio.

You are responsible for game design, Godot development, 3D art direction, gameplay engineering, UI/UX, optimization, and monetization.

Build a complete, polished, playable 3D mobile game called **COLOR DROP**.

This is a simple, colorful, satisfying casual puzzle/arcade game designed for iOS.

Do not create a static mockup. Build the actual game.

# 1. PROJECT REQUIREMENTS

Game name: Color Drop

Platform: iOS (iPhone)

Engine: Godot 4.x

Language: GDScript

Rendering: Native 3D

Orientation: Portrait

Account system: None

Registration: None

Backend: None required

Internet: Not required for core gameplay

Progress storage: Local device save

Advertising: Google AdMob

Game content: 120 handcrafted levels

Art direction: Premium colorful 3D casual mobile game.

The game must launch directly into the home screen without registration, login, or account creation.

# 2. CORE GAMEPLAY

The game revolves around collecting falling colored balls into matching colored compartments.

The player controls a horizontal collection tray containing three adjacent compartments.

Each compartment has a distinct color:
- Red
- Blue
- Yellow

The collection tray moves horizontally across the bottom part of the screen.

Colorful 3D balls fall from above.

The player must position the tray so that each ball lands inside its matching color compartment.

Example:
- Red ball must enter the red compartment.
- Blue ball must enter the blue compartment.
- Yellow ball must enter the yellow compartment.

Correct collection increases the score and level progress.

Incorrect collection reduces the player's available lives.

The player controls the tray using one-finger horizontal dragging.

Controls must feel extremely smooth, responsive, and intuitive.

Do not make the gameplay unnecessarily complicated.

# 3. GAMEPLAY DETAILS

Create a real 3D physics-based falling object system.

Ball requirements:
- Round 3D geometry.
- Smooth glossy materials.
- Different bright colors.
- Natural falling animation.
- Subtle bouncing.
- Proper collision detection.
- Optimized physics.

Tray requirements:
- Three clearly separated colored compartments.
- Attractive rounded 3D design.
- Smooth horizontal movement.
- Clear visual indication of each compartment.
- Proper collision shapes.
- Responsive touch controls.

The player must be able to move the tray smoothly without accidental vertical movement.

The tray must remain within the playable screen boundaries.

Balls should fall in different horizontal positions.

Avoid unfair ball spawning.

The game should always feel fair and readable.

# 4. GAMEPLAY FEEDBACK

Make every successful collection satisfying.

On correct collection:
- Play a soft satisfying sound.
- Show a small particle effect.
- Add a subtle glow.
- Increase progress.
- Display a small score animation.
- Use a smooth visual response.

On incorrect collection:
- Show gentle red feedback.
- Reduce one life.
- Play a subtle error sound.
- Avoid frustrating screen effects.

On level completion:
- Pause ball spawning.
- Animate the final score.
- Display a beautiful victory screen.
- Award coins.
- Offer a Continue button.

On losing all lives:
- Stop gameplay.
- Show a polished game-over screen.
- Offer Retry.
- Optionally offer a rewarded advertisement to continue.

# 5. LEVEL DESIGN — 120 LEVELS

Create exactly 120 playable, handcrafted level configurations.

Organize them into four worlds.

World 1: Beginner (Levels 1–30)
- Slow falling speed.
- Three basic colors.
- Few balls.
- No difficult obstacles.
- Introduce mechanics gradually.

World 2: Challenge (Levels 31–60)
- Increased falling speed.
- More balls.
- More complex sequences.
- Occasional obstacles.

World 3: Expert (Levels 61–90)
- Faster falling objects.
- More difficult color sequences.
- Additional obstacle types.
- More precise timing.

World 4: Master (Levels 91–120)
- Advanced combinations.
- Faster gameplay.
- More complex patterns.
- Challenging but fair level objectives.

Every level must be completable.

Difficulty must increase gradually, not suddenly.

Use data-driven level configurations rather than duplicating gameplay code.

Each level should define:
- Target number of collected balls.
- Ball spawn interval.
- Falling speed.
- Available colors.
- Obstacle probability.
- Maximum allowed mistakes.
- Optional bonus objectives.

Do not rely on completely random generation that can create impossible levels.

# 6. GAMEPLAY VARIATIONS

Introduce additional mechanics gradually.

Possible variations:

- Golden balls: bonus coins.
- Slow balls: move more slowly.
- Bombs: must be avoided.
- Multicolor balls: special bonus.
- Temporary speed boost.
- Moving obstacles.

Do not add all mechanics at the beginning.

The first 10 levels must teach only the core gameplay.

# 7. VISUAL DESIGN

The visual quality is extremely important.

Use actual 3D models and materials.

Visual direction:
- Bright and colorful.
- Premium casual mobile game style.
- Rounded geometry.
- Glossy colorful balls.
- Beautiful 3D collection tray.
- Soft shadows.
- Ambient lighting.
- Smooth gradients in the background.
- Subtle reflections.
- Attractive particle effects.

Use a clean colorful environment.

The gameplay area should occupy most of the screen.

Do not use flat 2D illustrations as a substitute for 3D objects.

Do not use emoji as game objects.

Avoid:
- Boring default Godot UI.
- Excessive text.
- Complicated menus.
- Generic dashboard layouts.
- Unnecessary decorative elements.

The game should look like a real commercial mobile game.

# 8. HOME SCREEN

Create an attractive and minimal home screen.

Include:
- Color Drop logo.
- Large Play button.
- Current level.
- Coin balance.
- Settings button.
- Beautiful animated 3D background.

Use colorful floating balls and subtle animations.

Keep the interface simple.

No registration.

No login.

No profile creation.

No unnecessary menus.

# 9. LEVEL SELECTION

Create a level selection screen.

Requirements:
- 120 levels.
- Four worlds.
- Locked and unlocked levels.
- Completed level indicators.
- Star ratings.
- Current level clearly highlighted.

Save level progress locally.

The player must be able to replay completed levels.

# 10. GAMEPLAY UI

Keep the gameplay UI minimal.

Show:
- Current level.
- Progress toward the objective.
- Remaining lives.
- Coin balance.
- Pause button.

Do not cover the falling balls or collection tray.

Use appropriate safe areas on iPhone screens.

# 11. REWARDS AND PROGRESSION

Implement:
- Coins.
- Level completion rewards.
- Three-star rating system.
- Local progress.
- Unlockable ball skins.
- Unlockable tray skins.
- Optional cosmetic rewards.

Cosmetic rewards must not provide unfair gameplay advantages.

Do not create an unnecessary shop in the first prototype.

# 12. GOOGLE ADMOB MONETIZATION

Prepare a real Google AdMob integration for iOS.

Use a compatible, verified Godot 4 iOS plugin or a native iOS bridge using Google's Mobile Ads SDK.

Before implementation:
- Verify the current Godot version.
- Verify the plugin compatibility.
- Verify the iOS export requirements.
- Do not invent APIs or fake SDK functionality.

Create a centralized AdManager.

### Rewarded Ads

Primary advertising format.

Offer optional rewarded ads for:
- One additional life after losing.
- Double coins after completing a level.
- Optional gameplay bonuses.

Rules:
- The player must explicitly choose to watch.
- Explain the reward before showing the ad.
- Grant the reward only after confirmed successful completion.
- If the ad is unavailable, the game must continue normally.
- Never force rewarded advertisements.

### Interstitial Ads

Use limited full-screen advertisements.

Rules:
- No forced ads during the first five levels.
- After that, start with one ad after every four completed levels.
- Minimum cooldown: 180 seconds.
- Never interrupt active gameplay.
- Never interrupt a falling ball sequence.
- Never show ads after every level.
- Do not show ads immediately after app launch.

### Banner Ads

Do not implement banners in the initial release.

### App Open Ads

Do not implement App Open ads.

### AdMob technical requirements

- Use official test ad IDs during development.
- Separate test and production configurations.
- Handle unavailable ads gracefully.
- Prevent duplicate ad requests.
- Prevent multiple simultaneous full-screen ads.
- Document where real AdMob IDs must be inserted.

Implement Google's UMP consent flow where required.

Respect Apple's App Tracking Transparency requirements if tracking is used.

Do not request tracking permission unnecessarily.

Advertising must never be required to play the game.

# 13. LOCAL SAVE SYSTEM

No registration or account is required.

Save progress directly on the device.

Store:
- Current unlocked level.
- Completed levels.
- Star ratings.
- Coin balance.
- Selected cosmetic skins.
- Sound settings.
- Music settings.
- Tutorial completion.

Use a versioned local save format.

Handle missing or corrupted save data safely.

The player must be able to close the game and continue later.

# 14. AUDIO

Add:
- Ball falling sounds.
- Successful collection sound.
- Incorrect collection sound.
- Coin collection sound.
- Button interaction sound.
- Level completion sound.
- Soft background music.

Allow sound and music to be turned off separately.

Keep the sound design satisfying rather than noisy.

# 15. TECHNICAL ARCHITECTURE

Use modular and maintainable code.

Suggested structure:

scenes/
  main/
  menus/
  gameplay/
  objects/
  ui/
  effects/

scripts/
  game_manager.gd
  level_manager.gd
  ball_spawner.gd
  ball_controller.gd
  tray_controller.gd
  collision_manager.gd
  score_manager.gd
  reward_manager.gd
  save_manager.gd
  audio_manager.gd
  ad_manager.gd
  settings_manager.gd

data/
  levels/
  cosmetics/

assets/
  models/
  materials/
  textures/
  sounds/
  music/

Keep gameplay logic separate from visual presentation.

Use reusable scenes and data-driven configurations.

# 16. PERFORMANCE AND IOS OPTIMIZATION

Target modern iPhones.

Requirements:
- Stable 60 FPS target.
- Efficient 3D materials.
- Optimized collision detection.
- Limited unnecessary physics calculations.
- Responsive touch controls.
- Proper screen safe areas.
- Correct portrait orientation.
- Efficient memory use.
- No unnecessary network requests.

The game must work offline except for advertising and other optional online services.

# 17. DEVELOPMENT ORDER

Do not attempt to build everything simultaneously.

PHASE 1:
Inspect the project and establish the Godot 4 project structure.

PHASE 2:
Build one playable 3D gameplay scene.

PHASE 3:
Implement falling balls, the three-compartment tray, touch controls, collisions, score, and lives.

PHASE 4:
Polish the graphics, lighting, animation, particles, and sounds.

PHASE 5:
Build the home screen, level selection, victory screen, and game-over screen.

PHASE 6:
Implement all 120 level configurations and local saving.

PHASE 7:
Prepare the AdMob integration and privacy flow.

PHASE 8:
Test and optimize for iOS.

After each phase:
- Run the project.
- Check errors.
- Fix broken functionality.
- Verify that the game is actually playable.

Do not stop at a written plan or a visual mockup.

# 18. ACCEPTANCE CRITERIA

The project is not complete if:
- Balls do not physically fall.
- The tray cannot be controlled with touch.
- Correct and incorrect collection are not detected.
- The gameplay is simulated using buttons.
- The game has no actual level progression.
- Progress is not saved.
- The UI is not adapted to iPhone screens.
- AdMob integration is falsely claimed to work without a compatible native implementation.

The project is complete when:
- The game launches directly without registration.
- The player can start immediately.
- Balls fall in a real 3D scene.
- The player moves the collection tray with one finger.
- Correct balls are collected.
- Incorrect balls reduce lives.
- Levels can be completed.
- Progress is saved locally.
- The game is visually polished.
- The iOS export is properly prepared.
- Advertising integration is documented and testable.

FINAL PRIORITIES:

1. Simple and addictive gameplay.
2. Beautiful 3D presentation.
3. Smooth one-finger controls.
4. 120 enjoyable levels.
5. Stable iOS performance.
6. Non-intrusive AdMob monetization.

Build a real, polished mobile game. Do not deliver a basic prototype disguised as a finished game.
