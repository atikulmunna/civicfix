-- Bangla names for the seeded categories and departments (F5), for databases made
-- before name_bn existed. Only a row whose English name is exactly a seeded one and
-- whose Bangla name is still empty is filled; everything else is left as it is, so
-- running this again changes nothing. The names match prisma/seed.ts.

UPDATE "categories" AS c
SET "name_bn" = v.bn
FROM (VALUES
  ('Roads & Potholes', 'রাস্তা ও গর্ত'),
  ('Street Lighting', 'রাস্তার বাতি'),
  ('Garbage & Sanitation', 'ময়লা ও পরিচ্ছন্নতা'),
  ('Water & Drainage', 'পানি ও নিষ্কাশন'),
  ('Public Safety', 'জননিরাপত্তা'),
  ('Parks & Greenery', 'পার্ক ও সবুজ'),
  ('Electricity', 'বিদ্যুৎ')
) AS v(en, bn)
WHERE c."name" = v.en AND c."name_bn" IS NULL;

UPDATE "departments" AS d
SET "name_bn" = v.bn
FROM (VALUES
  ('Public Works Department', 'গণপূর্ত বিভাগ'),
  ('Sanitation Department', 'পরিচ্ছন্নতা বিভাগ'),
  ('Water & Sewerage Authority', 'পানি ও পয়ঃনিষ্কাশন কর্তৃপক্ষ'),
  ('Electricity Board', 'বিদ্যুৎ বোর্ড'),
  ('Parks & Recreation', 'পার্ক ও বিনোদন বিভাগ')
) AS v(en, bn)
WHERE d."name" = v.en AND d."name_bn" IS NULL;
