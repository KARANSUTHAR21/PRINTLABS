insert into products (id, name, slug, description, category, price_paise, image, stock) values
  ('a4-print-paper', 'A4 Print Paper', 'a4-print-paper', '500 Sheets | 70 GSM', 'Paper & Printing', 20000, '/images/prod-paper.jpg', 120),
  ('a4-print-bw', 'A4 Print (B&W)', 'a4-print-bw', 'Per page · crisp black & white', 'Paper & Printing', 200, '/images/prod-print-bw.jpg', 5000),
  ('a4-print-colour', 'A4 Print (Colour)', 'a4-print-colour', 'Per page · vivid colour', 'Paper & Printing', 800, '/images/prod-paper.jpg', 4000),
  ('spiral-notebook', 'Spiral Notebook', 'spiral-notebook', 'A5 | 200 Pages', 'Notebooks', 8000, '/images/prod-notebook.jpg', 80),
  ('sketchbook', 'Sketchbook A4', 'sketchbook', 'A4 | 120 Pages | 120 GSM', 'Notebooks', 12000, '/images/prod-books.jpg', 40),
  ('ball-point-pen', 'Ball Point Pen', 'ball-point-pen', 'Smooth Writing', 'Writing', 1000, '/images/prod-pens.jpg', 300),
  ('blue-pen', 'Blue Pen', 'blue-pen', 'Smooth writing · everyday blue', 'Writing', 1000, '/images/prod-pens.jpg', 300),
  ('highlighter-set', 'Highlighter Set', 'highlighter-set', 'Pack of 4 · fluorescent', 'Writing', 4500, '/images/prod-highlighter.jpg', 60),
  ('sticky-notes', 'Sticky Notes', 'sticky-notes', '3 x 3 inch | 100 Sheets', 'Office Supplies', 3000, '/images/prod-sticky.jpg', 150),
  ('document-folder', 'Document Folder', 'document-folder', 'Foolscap · durable board', 'Office Supplies', 3500, '/images/prod-folder.jpg', 90),
  ('stapler', 'Desktop Stapler', 'stapler', 'Full strip · metal body', 'Office Supplies', 9000, '/images/prod-stapler.jpg', 35),
  ('envelope-pack', 'Envelope Pack', 'envelope-pack', 'Pack of 50 · A4 fit', 'Office Supplies', 6000, '/images/prod-envelope.jpg', 70),
  ('custom-mug', 'Custom Mug', 'custom-mug', 'Good Ideas Everyday', 'Custom Prints', 15000, '/images/prod-mug.jpg', 45),
  ('motivational-poster', 'Motivational Poster', 'motivational-poster', 'A3 | Premium Print', 'Custom Prints', 12000, '/images/prod-poster.jpg', 55),
  ('id-card', 'PVC ID Card', 'id-card', 'Same-day print · lanyard ready', 'Custom Prints', 5000, '/images/prod-idcard.jpg', 200),
  ('photo-print', '4×6 Photo Print', 'photo-print', 'Glossy · lab quality', 'Custom Prints', 1200, '/images/prod-photo.jpg', 800)
on conflict (id) do nothing;

insert into services (id, slug, title, subtitle, description, image, icon, sort_order) values
  ('print-copy', 'print-copy', 'Print & Copy', 'Black & White / Colour',
   'High quality black & white and colour printing for documents, photos, posters and more.',
   '/images/svc-print.jpg', 'printer', 1),
  ('scan-share', 'scan-share', 'Scan & Share', 'To Email / Drive',
   'Scan your documents and send them to email, USB or cloud storage.',
   '/images/svc-scan.jpg', 'scan', 2),
  ('stationery', 'stationery', 'Stationery', 'Everyday Essentials',
   'Everyday essentials like notebooks, pens, files, labels and more.',
   '/images/svc-stationery.jpg', 'book', 3),
  ('custom-prints', 'custom-prints', 'Custom Prints', 'Posters, ID Cards & More',
   'Personalized gifts, posters, ID cards, business cards and more.',
   '/images/svc-custom.jpg', 'image', 4),
  ('business-solutions', 'business-solutions', 'Business Solutions', 'Bulk & Corporate',
   'Bulk orders, corporate printing and customized stationery for your business.',
   '/images/svc-business.jpg', 'briefcase', 5)
on conflict (id) do nothing;
