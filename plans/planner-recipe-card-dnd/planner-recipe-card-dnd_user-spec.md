# Planner Recipe Card DnD User Spec

Original user description:

> Currently, on the planner page, it shows the recipe titles as text for each meal that has a planned recipe. Instead, I'd like to show the recipes as cards on those meals, and I want to be able to drag the recipe card from one meal to another across the meals of a day and from one meal to a different days different meal so I should be able to drag a recipe from one meal to any other meal on any other day or on the same daybecause if I'm just using it and I see turkey two days in a row I wanna just be able to drag that turkey meal to a turkey recipe two different meal so I'm not dragging to a sign. I'm still doing the normal workflow to assign a recipe to a specific meal, but once recipe is assigned, it shows up as a card on the meal cardyou know not any larger than it is currently so you would just take the currently size text and kind of format it so it looks like a card that's only a that's only a little bit bigger than the title already is so it's not a huge big square card. It's just a you know a little rectangular card that is just big enough to hold the current title of the recipe that's assigned to that day. Do you get where I'm going wiDon't do anything yet just confirm your understanding. Obviously, I would want to do all this in a new feature branch.

Clarified intent from follow-up confirmation:

- Keep the normal recipe assignment workflow as-is.
- After a recipe is assigned, show it as a compact card inside the meal slot instead of plain text.
- Make that assigned recipe card draggable between any meal slots in the same week view.
- Support dragging within the same day and across different days.
- Keep the card compact, only slightly larger than the current title text, not a large tile.
